import bpy
import os
import sys
import subprocess
import tempfile
import json
import queue
import threading
import uuid
import datetime
import bpy.utils.previews

bl_info = {
    "name": "AR USDZ Exporter",
    "author": "Gean Guilherme Lopes",
    "version": (2, 0, 0),
    "blender": (4, 2, 0),
    "location": "View3D > Sidebar > AR Exporter",
    "description": "Exporta modelos 3D para AR via QR Code — plano gratuito e Pro",
    "category": "Import-Export",
}

# ---------------------------------------------------------------------------
# Config — Configuração do Servidor e Credenciais
# ---------------------------------------------------------------------------
BACKEND_URL = "http://localhost:3000"
DEFAULT_DEVICE_ID = ""
DEFAULT_PRO_TOKEN = ""
DEFAULT_PRO_VALID = False

PRO_PURCHASE_URL = "http://localhost:3000"
SUPPORT_URL = "https://ko-fi.com/geancg"
MAX_FREE_FILES = 3

# ---------------------------------------------------------------------------
# Estado global
# ---------------------------------------------------------------------------
_export_state = {
    "status": "idle",   # idle | exporting | uploading | generating_qr | done | error
    "progress": 0,
    "filename": "",
    "size": "",
    "url": "",
    "file_id": "",
    "expires_at": None,
    "error_msg": "",
}
_preview_collections = {}
_result_queue = queue.Queue()


# ---------------------------------------------------------------------------
# Utilitários
# ---------------------------------------------------------------------------

def _history_path():
    config = bpy.utils.user_resource("CONFIG")
    os.makedirs(config, exist_ok=True)
    return os.path.join(config, "ar_exporter_history.json")


def load_history():
    path = _history_path()
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def save_history(history):
    with open(_history_path(), "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2, ensure_ascii=False)


def prepend_history(entry):
    history = load_history()
    history.insert(0, entry)
    save_history(history)


def remove_history_entry(file_id):
    history = [h for h in load_history() if h.get("file_id") != file_id]
    save_history(history)


def format_size(n):
    if n < 1024 * 1024:
        return f"{n / 1024:.0f} KB"
    return f"{n / (1024 * 1024):.1f} MB"


def days_left(expires_at_str):
    if not expires_at_str:
        return None
    try:
        exp = datetime.datetime.fromisoformat(expires_at_str.replace("Z", ""))
        delta = exp - datetime.datetime.utcnow()
        return max(0, delta.days)
    except Exception:
        return None


def is_expired(expires_at_str):
    if not expires_at_str:
        return False
    try:
        exp = datetime.datetime.fromisoformat(expires_at_str.replace("Z", ""))
        return datetime.datetime.utcnow() > exp
    except Exception:
        return False


def _prefs(context=None):
    ctx = context or getattr(bpy, "context", None)
    if not ctx:
        return None
    addon = ctx.preferences.addons.get(__name__)
    return addon.preferences if addon else None


def _get_backend_url(context=None):
    p = _prefs(context)
    if p and getattr(p, "backend_url", None) and p.backend_url.strip():
        return p.backend_url.strip().rstrip("/")
    return BACKEND_URL.rstrip("/")


def is_pro(context):
    p = _prefs(context)
    return bool(p and p.pro_token and p.pro_token_valid)


def _device_id(prefs):
    if not prefs.device_id:
        prefs.device_id = DEFAULT_DEVICE_ID or str(uuid.uuid4())
    return prefs.device_id


def _tag_redraw():
    for win in bpy.context.window_manager.windows:
        for area in win.screen.areas:
            if area.type == "VIEW_3D":
                area.tag_redraw()


# ---------------------------------------------------------------------------
# Dependências
# ---------------------------------------------------------------------------

def _ensure_deps():
    try:
        import requests
        import qrcode
        return True
    except ImportError:
        pass
    try:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "requests", "qrcode[pil]"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Captura de Snapshot do Modelo 3D
# ---------------------------------------------------------------------------

def _generate_snapshot(context, objects, output_path):
    """
    Renderiza um snapshot 3D limpo e nítido do modelo selecionado
    com fundo transparente para servir de thumbnail no app e no USDZ.
    """
    import math
    import mathutils

    scene = context.scene
    orig_cam = scene.camera
    orig_filepath = scene.render.filepath
    orig_res_x = scene.render.resolution_x
    orig_res_y = scene.render.resolution_y
    orig_res_pct = scene.render.resolution_percentage
    orig_film_transparent = scene.render.film_transparent
    orig_color_mode = scene.render.image_settings.color_mode
    orig_file_format = scene.render.image_settings.file_format

    cam_obj = None
    cam_data = None

    try:
        depsgraph = context.evaluated_depsgraph_get()
        all_points = []
        for o in objects:
            try:
                eval_o = o.evaluated_get(depsgraph)
                bb = eval_o.bound_box
                mat = o.matrix_world
                for corner in bb:
                    all_points.append(mat @ mathutils.Vector(corner))
            except Exception:
                all_points.append(o.matrix_world.translation)

        if not all_points:
            center = mathutils.Vector((0, 0, 0))
            radius = 1.0
        else:
            center = sum(all_points, mathutils.Vector((0, 0, 0))) / len(all_points)
            radius = max((p - center).length for p in all_points)
            if radius <= 0.001:
                radius = 1.0

        # Cria câmera temporária com enquadramento perfeito (isométrico suave)
        cam_data = bpy.data.cameras.new(name="__AR_Snap_Camera")
        cam_data.lens = 50
        cam_obj = bpy.data.objects.new(name="__AR_Snap_Camera", object_data=cam_data)
        scene.collection.objects.link(cam_obj)

        dist = radius * 2.3
        cam_pos = center + mathutils.Vector((dist * 0.72, -dist * 0.88, dist * 0.58))
        cam_obj.location = cam_pos

        direction = center - cam_pos
        rot_quat = direction.to_track_quat("-Z", "Y")
        cam_obj.rotation_euler = rot_quat.to_euler()

        scene.camera = cam_obj
        scene.render.resolution_x = 512
        scene.render.resolution_y = 512
        scene.render.resolution_percentage = 100
        scene.render.film_transparent = True
        scene.render.image_settings.file_format = "PNG"
        scene.render.image_settings.color_mode = "RGBA"
        scene.render.filepath = output_path

        rendered = False
        try:
            bpy.ops.render.opengl(write_still=True, view_context=False)
            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                rendered = True
        except Exception:
            pass

        if not rendered:
            try:
                bpy.ops.render.render(write_still=True)
                if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                    rendered = True
            except Exception as e_rnd:
                print(f"[AR Exporter] Erro no render de snapshot: {e_rnd}")

        return rendered
    except Exception as e:
        print(f"[AR Exporter] Exceção ao capturar snapshot: {e}")
        return False
    finally:
        if cam_obj:
            try:
                bpy.data.objects.remove(cam_obj, do_unlink=True)
            except Exception:
                pass
        if cam_data:
            try:
                bpy.data.cameras.remove(cam_data, do_unlink=True)
            except Exception:
                pass
        scene.camera = orig_cam
        scene.render.filepath = orig_filepath
        scene.render.resolution_x = orig_res_x
        scene.render.resolution_y = orig_res_y
        scene.render.resolution_percentage = orig_res_pct
        scene.render.film_transparent = orig_film_transparent
        scene.render.image_settings.color_mode = orig_color_mode
        scene.render.image_settings.file_format = orig_file_format


# ---------------------------------------------------------------------------
# Rede
# ---------------------------------------------------------------------------

def _upload(filepath, device_id, pro_token=None, backend_url=None, thumbnail_path=None):
    import requests

    endpoint = (backend_url or _get_backend_url()).rstrip("/")
    filename = os.path.basename(filepath)
    with open(filepath, "rb") as fh:
        data = {"device_id": device_id}
        if pro_token:
            data["pro_token"] = pro_token

        files = {"file": (filename, fh, "model/vnd.usdz+zip")}
        thumb_fh = None
        if thumbnail_path and os.path.exists(thumbnail_path) and os.path.getsize(thumbnail_path) > 0:
            try:
                thumb_fh = open(thumbnail_path, "rb")
                files["thumbnail"] = ("thumbnail.png", thumb_fh, "image/png")
            except Exception:
                thumb_fh = None

        try:
            resp = requests.post(
                f"{endpoint}/upload",
                files=files,
                data=data,
                timeout=90,
            )
        finally:
            if thumb_fh:
                thumb_fh.close()

    if resp.status_code == 429:
        raise RuntimeError("LIMIT_REACHED")
    resp.raise_for_status()
    return resp.json()


def _delete_remote(file_id, device_id, pro_token=None, backend_url=None):
    import requests

    endpoint = (backend_url or _get_backend_url()).rstrip("/")
    body = {"device_id": device_id}
    if pro_token:
        body["pro_token"] = pro_token
    try:
        requests.delete(f"{endpoint}/file/{file_id}", json=body, timeout=15)
    except Exception:
        pass


def _validate_token(token, backend_url=None):
    import requests

    endpoint = (backend_url or _get_backend_url()).rstrip("/")
    resp = requests.post(
        f"{endpoint}/validate-token",
        json={"token": token},
        timeout=15,
    )
    return resp.status_code == 200 and resp.json().get("valid", False)


# ---------------------------------------------------------------------------
# Thread de upload
# ---------------------------------------------------------------------------

def _upload_thread(filepath, device_id, pro_token, backend_url=None, thumbnail_path=None):
    try:
        _result_queue.put(("step", "uploading", 50))
        result = _upload(filepath, device_id, pro_token, backend_url, thumbnail_path)

        _result_queue.put(("step", "generating_qr", 80))

        import qrcode

        qr = qrcode.QRCode(box_size=10, border=2)
        qr.add_data(result["url"])
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        qr_path = os.path.join(tempfile.gettempdir(), "ar_qr_preview.png")
        img.save(qr_path)

        _result_queue.put(("done", result, qr_path, thumbnail_path))
    except RuntimeError as e:
        _result_queue.put(("error", str(e)))
    except Exception as e:
        _result_queue.put(("error", str(e)))


def _poll_result():
    global _export_state, _preview_collections
    try:
        msg = _result_queue.get_nowait()
    except queue.Empty:
        return 0.25

    kind = msg[0]

    if kind == "step":
        _export_state["status"] = msg[1]
        _export_state["progress"] = msg[2]
        _tag_redraw()
        return 0.25

    if kind == "done":
        result = msg[1]
        qr_path = msg[2]
        thumb_path = msg[3] if len(msg) > 3 else None

        pcoll = _preview_collections.get("main")
        if pcoll:
            bpy.utils.previews.remove(pcoll)
        pcoll = bpy.utils.previews.new()
        pcoll.load("qr_code", qr_path, "IMAGE")
        if thumb_path and os.path.exists(thumb_path) and os.path.getsize(thumb_path) > 0:
            try:
                pcoll.load("model_thumbnail", thumb_path, "IMAGE")
            except Exception:
                pass
        _preview_collections["main"] = pcoll

        _export_state.update(
            status="done",
            progress=100,
            url=result["url"],
            file_id=result["file_id"],
            expires_at=result.get("expires_at"),
            thumbnail_url=result.get("thumbnail_url"),
        )

        prepend_history(
            {
                "file_id": result["file_id"],
                "filename": _export_state["filename"],
                "url": result["url"],
                "size_bytes": result.get("size", 0),
                "created_at": datetime.datetime.utcnow().isoformat(),
                "expires_at": result.get("expires_at"),
            }
        )
        _tag_redraw()
        return None

    if kind == "error":
        _export_state["status"] = "error"
        _export_state["error_msg"] = msg[1]
        _tag_redraw()
        return None

    return 0.25


# ---------------------------------------------------------------------------
# Preferências
# ---------------------------------------------------------------------------

class AR_AddonPreferences(bpy.types.AddonPreferences):
    bl_idname = __name__

    backend_url: bpy.props.StringProperty(
        name="Servidor Backend",
        default=BACKEND_URL,
        description="URL do servidor AR Exporter",
    )
    device_id: bpy.props.StringProperty(
        name="Device ID",
        default=DEFAULT_DEVICE_ID,
        description="Identificador único deste dispositivo",
    )
    pro_token: bpy.props.StringProperty(
        name="Chave Pro / Token Pix",
        subtype="PASSWORD",
        default=DEFAULT_PRO_TOKEN,
        description="Token de licença Pro",
    )
    pro_token_valid: bpy.props.BoolProperty(
        name="Token Válido",
        default=DEFAULT_PRO_VALID,
    )

    def draw(self, context):
        layout = self.layout

        # Configuração do Servidor
        box_net = layout.box()
        box_net.label(text="Conexão com o Servidor AR:", icon="URL")
        box_net.prop(self, "backend_url", text="URL Backend")
        box_net.prop(self, "device_id", text="Device ID")

        box = layout.box()
        if self.pro_token_valid and self.pro_token:
            row = box.row()
            row.label(text="Plano Pro ativo", icon="FAKE_USER_ON")
            row.operator("ar.deactivate_token", text="Remover", icon="X")
        else:
            box.label(text="Plano Gratuito — 3 exports · Expiram em 7 dias", icon="USER")
            col = box.column(align=True)
            col.label(text="Chave de licença Pro:")
            row = col.row(align=True)
            row.prop(self, "pro_token", text="")
            row.operator("ar.activate_token", text="Ativar")
            box.label(text="A chave chega por e-mail ou via Pix após a compra.")
            layout.separator()
            layout.operator("wm.url_open", text="Comprar Plano Pro", icon="FUND").url = PRO_PURCHASE_URL


# ---------------------------------------------------------------------------
# Operadores
# ---------------------------------------------------------------------------

class AR_OT_Export(bpy.types.Operator):
    bl_idname = "ar.export_and_qr"
    bl_label = "Exportar para AR"
    bl_description = "Exporta o objeto selecionado para USDZ e gera QR Code para AR"

    def execute(self, context):
        global _export_state

        prefs = _prefs(context)
        if not prefs:
            self.report({"ERROR"}, "Addon não encontrado nas preferências.")
            return {"CANCELLED"}

        if not _ensure_deps():
            self.report({"ERROR"}, "Falha ao instalar dependências. Verifique a conexão.")
            return {"CANCELLED"}

        if not context.selected_objects:
            self.report({"ERROR"}, "Selecione um objeto primeiro!")
            return {"CANCELLED"}

        pro = is_pro(context)

        # Checar limite do plano gratuito
        if not pro:
            active = [
                h for h in load_history()
                if not is_expired(h.get("expires_at"))
            ]
            if len(active) >= MAX_FREE_FILES:
                bpy.ops.ar.show_limit_dialog("INVOKE_DEFAULT")
                return {"CANCELLED"}

        obj = context.selected_objects[0]
        safe_name = obj.name.replace(" ", "_").lower()
        tmp = os.path.join(tempfile.gettempdir(), f"{safe_name}.usdz")

        _export_state.update(
            status="exporting",
            progress=20,
            filename=f"{safe_name}.usdz",
            error_msg="",
            url="",
            file_id="",
            expires_at=None,
        )
        _tag_redraw()

        try:
            bpy.ops.wm.usd_export(filepath=tmp)
        except Exception as e:
            _export_state.update(status="error", error_msg=f"Falha na exportação: {e}")
            _tag_redraw()
            return {"CANCELLED"}

        size_bytes = os.path.getsize(tmp) if os.path.exists(tmp) else 0
        _export_state["size"] = format_size(size_bytes)

        # Capturar Snapshot nítido do modelo 3D em Blender
        thumb_tmp = os.path.join(tempfile.gettempdir(), f"{safe_name}_thumb.png")
        try:
            _generate_snapshot(context, context.selected_objects, thumb_tmp)
        except Exception as snap_err:
            print(f"[AR Exporter] Erro na captura de snapshot: {snap_err}")

        # Embutir thumbnail dentro do arquivo USDZ (compatibilidade total com Apple QuickLook / iOS)
        if os.path.exists(thumb_tmp) and os.path.getsize(thumb_tmp) > 0:
            try:
                import zipfile
                with zipfile.ZipFile(tmp, "a", compression=zipfile.ZIP_STORED) as zf:
                    zf.write(thumb_tmp, "thumbnails/thumbnail.png")
                    zf.write(thumb_tmp, "thumbnail.png")
            except Exception as zerr:
                print(f"[AR Exporter] Aviso ao embutir thumbnail no USDZ: {zerr}")

        device_id = _device_id(prefs)
        token = prefs.pro_token if pro else None
        backend_url = _get_backend_url(context)

        _export_state["status"] = "uploading"
        _export_state["progress"] = 40
        _tag_redraw()

        t = threading.Thread(
            target=_upload_thread,
            args=(tmp, device_id, token, backend_url, thumb_tmp),
            daemon=True,
        )
        t.start()
        bpy.app.timers.register(_poll_result, first_interval=0.25)

        return {"FINISHED"}


class AR_OT_CopyLink(bpy.types.Operator):
    bl_idname = "ar.copy_link"
    bl_label = "Copiar Link"
    url: bpy.props.StringProperty(default="")

    def execute(self, context):
        context.window_manager.clipboard = self.url
        self.report({"INFO"}, "Link copiado!")
        return {"FINISHED"}


class AR_OT_DeleteFile(bpy.types.Operator):
    bl_idname = "ar.delete_file"
    bl_label = "Apagar arquivo?"
    bl_description = "Remove este arquivo do servidor. Esta ação não pode ser desfeita"

    file_id: bpy.props.StringProperty()
    filename: bpy.props.StringProperty()

    def invoke(self, context, event):
        return context.window_manager.invoke_confirm(self, event)

    def execute(self, context):
        prefs = _prefs(context)
        device_id = _device_id(prefs) if prefs else ""
        token = prefs.pro_token if (prefs and is_pro(context)) else None
        backend_url = _get_backend_url(context)

        _delete_remote(self.file_id, device_id, token, backend_url)
        remove_history_entry(self.file_id)

        if _export_state.get("file_id") == self.file_id:
            _export_state.update(status="idle", url="", file_id="")

        _tag_redraw()
        self.report({"INFO"}, f'"{self.filename}" removido.')
        return {"FINISHED"}


class AR_OT_ActivateToken(bpy.types.Operator):
    bl_idname = "ar.activate_token"
    bl_label = "Ativar"
    bl_description = "Valida a chave Pro com o servidor"

    def execute(self, context):
        prefs = _prefs(context)
        if not prefs or not prefs.pro_token:
            self.report({"ERROR"}, "Insira sua chave Pro antes de ativar.")
            return {"CANCELLED"}

        if not _ensure_deps():
            self.report({"ERROR"}, "Sem conexão para validar a chave.")
            return {"CANCELLED"}

        backend_url = _get_backend_url(context)
        try:
            valid = _validate_token(prefs.pro_token, backend_url)
        except Exception as e:
            self.report({"ERROR"}, f"Erro ao validar: {e}")
            return {"CANCELLED"}

        if valid:
            prefs.pro_token_valid = True
            self.report({"INFO"}, "Plano Pro ativado!")
        else:
            prefs.pro_token_valid = False
            self.report({"ERROR"}, "Chave inválida. Verifique o e-mail de confirmação da compra.")

        return {"FINISHED"}


class AR_OT_DeactivateToken(bpy.types.Operator):
    bl_idname = "ar.deactivate_token"
    bl_label = "Remover licença Pro"

    def execute(self, context):
        prefs = _prefs(context)
        if prefs:
            prefs.pro_token = ""
            prefs.pro_token_valid = False
        return {"FINISHED"}


class AR_OT_ShowLimitDialog(bpy.types.Operator):
    bl_idname = "ar.show_limit_dialog"
    bl_label = "Limite de exportação"

    def invoke(self, context, event):
        return context.window_manager.invoke_props_dialog(self, width=360)

    def draw(self, context):
        layout = self.layout
        layout.label(text=f"Limite de {MAX_FREE_FILES} exports atingido no plano gratuito.", icon="ERROR")
        layout.label(text="Apague um arquivo no Histórico ou assine o Plano Pro.")
        layout.separator()
        layout.operator("wm.url_open", text="Assinar Plano Pro", icon="FUND").url = PRO_PURCHASE_URL

    def execute(self, context):
        return {"FINISHED"}


# ---------------------------------------------------------------------------
# Painéis
# ---------------------------------------------------------------------------

class AR_PT_Panel(bpy.types.Panel):
    bl_label = "AR EXPORTER"
    bl_idname = "AR_PT_main_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "AR Exporter"

    def draw_header(self, context):
        if is_pro(context):
            self.layout.label(text="", icon="FAKE_USER_ON")

    def draw(self, context):
        layout = self.layout
        status = _export_state["status"]

        # --- Badge de plano ---
        row = layout.row()
        if is_pro(context):
            row.label(text="Plano Pro", icon="FAKE_USER_ON")
        else:
            history = load_history()
            active_count = sum(1 for h in history if not is_expired(h.get("expires_at")))
            row.label(text=f"Gratuito  {active_count}/{MAX_FREE_FILES} exports", icon="USER")

        layout.separator(factor=0.5)

        # --- Botão de export (idle / done / error) ---
        if status in ("idle", "done", "error"):
            col = layout.column()
            col.scale_y = 1.5
            col.operator("ar.export_and_qr", text="Exportar para AR", icon="EXPORT")

        # --- Progresso ---
        if status in ("exporting", "uploading", "generating_qr"):
            box = layout.box()
            labels_map = {
                "exporting": f"Exportando modelo... {_export_state['progress']}%",
                "uploading": f"Enviando para o servidor... {_export_state['progress']}%",
                "generating_qr": f"Gerando QR Code... {_export_state['progress']}%",
            }
            box.label(text=labels_map.get(status, "Processando..."))

            col = box.column(align=True)

            # Passo 1 — exportar
            if status == "exporting":
                col.label(text=f"  Exportando: {_export_state['filename']}", icon="TIME")
            else:
                col.label(text=f"  Exportado: {_export_state['filename']}", icon="CHECKMARK")

            # Passo 2 — upload
            if status == "uploading":
                col.label(text="  Enviando para o servidor...", icon="TIME")
            elif status == "generating_qr":
                col.label(text="  Enviado para o servidor", icon="CHECKMARK")
            else:
                col.label(text="  Aguardando envio...", icon="RADIOBUT_OFF")

            # Passo 3 — QR
            if status == "generating_qr":
                col.label(text="  Gerando QR Code...", icon="TIME")
            else:
                col.label(text="  QR Code", icon="RADIOBUT_OFF")

        # --- Erro ---
        if status == "error":
            box = layout.box()
            box.label(text="Erro na exportação", icon="ERROR")
            msg = _export_state.get("error_msg", "")
            if msg == "LIMIT_REACHED":
                box.label(text="Limite de exports atingido.")
                box.operator("wm.url_open", text="Assinar Plano Pro", icon="FUND").url = PRO_PURCHASE_URL
            else:
                for chunk in [msg[i:i+55] for i in range(0, min(len(msg), 165), 55)]:
                    box.label(text=chunk)
            box.operator("ar.export_and_qr", text="Tentar novamente", icon="FILE_REFRESH")

        # --- QR Code pronto ---
        if status == "done" and _export_state.get("url"):
            layout.separator(factor=0.5)
            box = layout.box()
            box.label(text="Pronto para escanear", icon="CHECKMARK")

            pcoll = _preview_collections.get("main")
            if pcoll and "model_thumbnail" in pcoll:
                box_thumb = box.box()
                box_thumb.label(text="Snapshot 3D do Arquivo:", icon="CAMERA")
                box_thumb.template_icon(icon_value=pcoll["model_thumbnail"].icon_id, scale=6.0)

            if pcoll and "qr_code" in pcoll:
                box.template_icon(icon_value=pcoll["qr_code"].icon_id, scale=8.0)

            meta = _export_state["filename"]
            if _export_state["size"]:
                meta += f"  ·  {_export_state['size']}"
            box.label(text=meta)

            if not is_pro(context):
                d = days_left(_export_state.get("expires_at"))
                if d is not None:
                    icon = "ERROR" if d <= 2 else "TIME"
                    box.label(text=f"Expira em {d} dia(s)" if d > 0 else "Expirado", icon=icon)

            row = box.row(align=True)
            op = row.operator("ar.copy_link", text="Copiar link", icon="COPYDOWN")
            op.url = _export_state["url"]
            row.operator("wm.url_open", text="Abrir", icon="WORLD").url = _export_state["url"]

        # --- Pay What You Want (apenas gratuito) ---
        if not is_pro(context):
            layout.separator(factor=0.5)
            box = layout.box()
            box.label(text="Curtiu o plugin? Apoie o projeto!", icon="FUND")
            box.operator("wm.url_open", text="Contribuir com qualquer valor", icon="HEART").url = SUPPORT_URL


class AR_PT_HistoryPanel(bpy.types.Panel):
    bl_label = "Histórico"
    bl_idname = "AR_PT_history_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "AR Exporter"
    bl_parent_id = "AR_PT_main_panel"
    bl_options = {"DEFAULT_CLOSED"}

    def draw(self, context):
        layout = self.layout
        history = load_history()
        pro = is_pro(context)

        if not history:
            layout.label(text="Nenhum export ainda.", icon="INFO")
            return

        for item in history:
            box = layout.box()
            row = box.row()
            row.label(text=item.get("filename", "?"), icon="FILE_3D")

            op = row.operator("ar.delete_file", text="", icon="TRASH")
            op.file_id = item.get("file_id", "")
            op.filename = item.get("filename", "")

            size_str = format_size(item.get("size_bytes", 0))
            created = (item.get("created_at") or "")[:10]
            box.label(text=f"{size_str}  ·  {created}")

            if not pro:
                exp = item.get("expires_at")
                d = days_left(exp)
                if d is not None:
                    if d == 0:
                        box.label(text="Expirado", icon="ERROR")
                    elif d <= 2:
                        box.label(text=f"Expira em {d} dia(s)", icon="ERROR")
                    else:
                        box.label(text=f"Expira em {d} dias", icon="TIME")

            url = item.get("url", "")
            if url:
                row2 = box.row(align=True)
                op2 = row2.operator("ar.copy_link", text="Copiar link", icon="COPYDOWN")
                op2.url = url
                row2.operator("wm.url_open", text="Abrir", icon="WORLD").url = url


class AR_PT_SettingsPanel(bpy.types.Panel):
    bl_label = "Plano & Configurações"
    bl_idname = "AR_PT_settings_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "AR Exporter"
    bl_parent_id = "AR_PT_main_panel"
    bl_options = {"DEFAULT_CLOSED"}

    def draw(self, context):
        layout = self.layout
        prefs = _prefs(context)
        if not prefs:
            return

        # Servidor
        box_srv = layout.box()
        box_srv.label(text="Servidor Backend:", icon="URL")
        box_srv.prop(prefs, "backend_url", text="")

        pro = is_pro(context)
        box = layout.box()

        if pro:
            box.label(text="Plano Pro ativo", icon="FAKE_USER_ON")
            box.label(text="Exports ilimitados · Permanentes · Analytics")
            box.operator("ar.deactivate_token", text="Remover licença", icon="X")
        else:
            box.label(text="Plano Gratuito", icon="USER")
            box.label(text=f"{MAX_FREE_FILES} exports simultâneos · Expiram em 7 dias")

            layout.separator(factor=0.5)
            box2 = layout.box()
            box2.label(text="Ativar Plano Pro:")
            row = box2.row(align=True)
            row.prop(prefs, "pro_token", text="")
            row.operator("ar.activate_token", text="Ativar", icon="CHECKMARK")
            box2.label(text="A chave chega por e-mail após a compra.")

            layout.separator(factor=0.5)
            layout.operator(
                "wm.url_open", text="Assinar Plano Pro  →", icon="FUND"
            ).url = PRO_PURCHASE_URL


# ---------------------------------------------------------------------------
# Registro
# ---------------------------------------------------------------------------

_classes = (
    AR_AddonPreferences,
    AR_OT_Export,
    AR_OT_CopyLink,
    AR_OT_DeleteFile,
    AR_OT_ActivateToken,
    AR_OT_DeactivateToken,
    AR_OT_ShowLimitDialog,
    AR_PT_Panel,
    AR_PT_HistoryPanel,
    AR_PT_SettingsPanel,
)


def register():
    for cls in _classes:
        bpy.utils.register_class(cls)
    _preview_collections["main"] = bpy.utils.previews.new()


def unregister():
    for pcoll in _preview_collections.values():
        bpy.utils.previews.remove(pcoll)
    _preview_collections.clear()
    for cls in reversed(_classes):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
