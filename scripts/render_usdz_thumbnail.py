import os
import sys
import zipfile
import numpy as np

def extract_or_render_thumbnail(usdz_path: str, output_png_path: str):
    if not os.path.exists(usdz_path):
        sys.stderr.write(f"Error: USDZ file not found at {usdz_path}\n")
        sys.exit(1)

    # 1. Check if the USDZ already contains an embedded thumbnail
    try:
        with zipfile.ZipFile(usdz_path, "r") as zf:
            namelist = zf.namelist()
            # Prioritize standard Apple USDZ thumbnail paths
            preferred_names = [
                "thumbnails/thumbnail.png",
                "thumbnail.png",
                "thumbnails/thumbnail.jpg",
                "thumbnail.jpg",
                "preview.png",
                "snapshot.png",
            ]
            found_entry = None
            for p in preferred_names:
                for name in namelist:
                    if name.lower() == p:
                        found_entry = name
                        break
                if found_entry:
                    break

            if not found_entry:
                # Any image file
                for name in namelist:
                    lower = name.lower()
                    if lower.endswith((".png", ".jpg", ".jpeg", ".webp")):
                        found_entry = name
                        break

            if found_entry:
                data = zf.read(found_entry)
                with open(output_png_path, "wb") as out_f:
                    out_f.write(data)
                print(f"Extracted embedded thumbnail '{found_entry}' ({len(data)} bytes)")
                return
    except Exception as e:
        sys.stderr.write(f"Warning checking embedded thumbnail: {e}\n")

    # 2. Render from 3D geometry using usd-core, numpy, matplotlib and pillow
    try:
        from pxr import Usd, UsdGeom, UsdShade
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from mpl_toolkits.mplot3d.art3d import Poly3DCollection
        from PIL import Image, ImageDraw, ImageFilter

        stage = Usd.Stage.Open(usdz_path)
        if not stage:
            raise RuntimeError("Could not open USD stage")

        up_axis = stage.GetMetadata("upAxis") or "Y"

        # Directional light in world/camera space
        light_dir = np.array([0.4, -0.6, 0.9])
        light_dir = light_dir / np.linalg.norm(light_dir)

        # Shader materials mapping
        mat_colors = {}
        for p in stage.Traverse():
            if p.IsA(UsdShade.Shader):
                shader = UsdShade.Shader(p)
                for inp in shader.GetInputs():
                    if inp.GetBaseName() in ["diffuseColor", "baseColor", "emissiveColor"]:
                        val = inp.Get()
                        if val is not None:
                            try:
                                mat_colors[p.GetParent().GetPath()] = np.array([float(val[0]), float(val[1]), float(val[2])])
                            except Exception:
                                pass

        all_verts = []
        polys = []
        facecolors = []
        edgecolors = []

        default_color = np.array([0.22, 0.65, 0.95]) # Elegant sky blue

        for p in stage.Traverse():
            if p.IsA(UsdGeom.Mesh):
                mesh = UsdGeom.Mesh(p)
                xf = UsdGeom.Xformable(p)
                mat = np.array(xf.ComputeLocalToWorldTransform(Usd.TimeCode.Default())).T

                pts = mesh.GetPointsAttr().Get()
                counts = mesh.GetFaceVertexCountsAttr().Get()
                indices = mesh.GetFaceVertexIndicesAttr().Get()
                if not pts or not counts or not indices:
                    continue

                pts_np = np.array(pts)
                ones = np.ones((len(pts_np), 1))
                pts_h = np.hstack([pts_np, ones])
                pts_world = (mat @ pts_h.T).T[:, :3]
                all_verts.append(pts_world)

                # Determine base material color
                binding = UsdShade.MaterialBindingAPI(p)
                direct_mat = binding.GetDirectBinding().GetMaterial()
                mat_path = direct_mat.GetPath() if direct_mat else None
                base_color = mat_colors.get(mat_path, default_color)

                idx = 0
                for cnt in counts:
                    poly_indices = indices[idx:idx + cnt]
                    poly_pts = pts_world[poly_indices]
                    idx += cnt

                    if len(poly_pts) >= 3:
                        v1 = poly_pts[1] - poly_pts[0]
                        v2 = poly_pts[2] - poly_pts[0]
                        n = np.cross(v1, v2)
                        norm = np.linalg.norm(n)
                        n = n / norm if norm > 0 else np.array([0, 0, 1])
                        diffuse = max(0.0, float(np.dot(n, light_dir)))
                        shade = 0.40 + 0.60 * diffuse
                        c = np.clip(base_color * shade, 0.0, 1.0)

                        polys.append(poly_pts)
                        facecolors.append((c[0], c[1], c[2], 1.0))
                        edgecolors.append((c[0] * 0.75, c[1] * 0.75, c[2] * 0.75, 0.3))

        if not polys or not all_verts:
            raise RuntimeError("No 3D polygon meshes found in USDZ stage")

        fig = plt.figure(figsize=(5.12, 5.12), dpi=100)
        ax = fig.add_subplot(111, projection="3d")
        ax.set_facecolor((1, 1, 1, 0))
        fig.patch.set_alpha(0.0)

        collection = Poly3DCollection(polys, facecolors=facecolors, edgecolors=edgecolors, linewidths=0.25)
        ax.add_collection3d(collection)

        all_pts_concat = np.vstack(all_verts)
        min_coords = all_pts_concat.min(axis=0)
        max_coords = all_pts_concat.max(axis=0)
        center = (min_coords + max_coords) / 2.0
        max_range = (max_coords - min_coords).max() / 2.0 * 1.15

        ax.set_xlim(center[0] - max_range, center[0] + max_range)
        ax.set_ylim(center[1] - max_range, center[1] + max_range)
        ax.set_zlim(center[2] - max_range, center[2] + max_range)

        if up_axis == "Z":
            ax.view_init(elev=6, azim=-90)
        else:
            ax.view_init(elev=12, azim=-60)

        ax.set_axis_off()
        plt.subplots_adjust(left=0, right=1, bottom=0, top=1)

        raw_render_path = output_png_path + ".raw.png"
        plt.savefig(raw_render_path, dpi=100, transparent=True)
        plt.close(fig)

        # Composite onto Apple QuickLook styled white card
        model_img = Image.open(raw_render_path).convert("RGBA")
        bbox = model_img.getbbox()
        if bbox:
            model_img = model_img.crop(bbox)

        size = 512
        card = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        model_img.thumbnail((390, 390), Image.Resampling.LANCZOS)
        mw, mh = model_img.size

        # Soft shadow
        shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        sdraw = ImageDraw.Draw(shadow)
        sdraw.rounded_rectangle([20, 24, 492, 496], radius=44, fill=(0, 0, 0, 35))
        shadow = shadow.filter(ImageFilter.GaussianBlur(12))
        card.alpha_composite(shadow)

        # White rounded card
        cdraw = ImageDraw.Draw(card)
        cdraw.rounded_rectangle([20, 20, 492, 492], radius=44, fill=(255, 255, 255, 255))

        # Paste model image centered
        card.alpha_composite(model_img, ((size - mw) // 2, (size - mh) // 2))
        card.save(output_png_path, "PNG")

        if os.path.exists(raw_render_path):
            try:
                os.remove(raw_render_path)
            except Exception:
                pass

        print(f"Rendered 3D geometry from uploaded file to {output_png_path}")

        # Also embed the rendered thumbnail back into the USDZ archive (Apple USDZ official spec)
        try:
            with zipfile.ZipFile(usdz_path, "a") as zf:
                zf.write(output_png_path, "thumbnails/thumbnail.png")
                zf.write(output_png_path, "thumbnail.png")
            print("Embedded thumbnail into USDZ file archive")
        except Exception as embed_err:
            sys.stderr.write(f"Notice: Could not write thumbnail back into USDZ archive: {embed_err}\n")

    except Exception as render_err:
        sys.stderr.write(f"Error rendering 3D model geometry: {render_err}\n")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 render_usdz_thumbnail.py <input.usdz> <output.png>")
        sys.exit(1)
    extract_or_render_thumbnail(sys.argv[1], sys.argv[2])
