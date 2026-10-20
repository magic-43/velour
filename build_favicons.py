import os
import base64
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_TTF = os.path.join(SCRIPT_DIR, 'cormorant.ttf')
WOFF_B64_FILE = os.path.join(SCRIPT_DIR, 'cormorant_woff_b64.txt')

TARGET_DIRS = [
    r'C:\Users\GODGIVE COMPUTER LTD\Desktop\velour-v2\public',
    r'C:\Users\GODGIVE COMPUTER LTD\Desktop\Velour\public',
]

def generate_svg():
    with open(WOFF_B64_FILE, 'r', encoding='utf-8') as f:
        b64 = f.read().strip()

    svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <style>
      @font-face {{
        font-family: 'Cormorant Garamond';
        font-style: normal;
        font-weight: 600;
        src: url(data:font/woff;base64,{b64}) format('woff');
      }}
      .monogram-v {{
        font-family: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
        font-size: 380px;
        font-weight: 600;
        text-anchor: middle;
        dominant-baseline: central;
      }}
    </style>
    <linearGradient id="velourGold" x1="15%" y1="0%" x2="85%" y2="100%">
      <stop offset="0%" stop-color="#faeed7" />
      <stop offset="30%" stop-color="#e4c38d" />
      <stop offset="65%" stop-color="#c9a96e" />
      <stop offset="100%" stop-color="#8e682e" />
    </linearGradient>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#141312" />
      <stop offset="50%" stop-color="#090909" />
      <stop offset="100%" stop-color="#040404" />
    </linearGradient>
    <linearGradient id="rimGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#faeed7" stop-opacity="0.5" />
      <stop offset="35%" stop-color="#c9a96e" stop-opacity="0.35" />
      <stop offset="70%" stop-color="#881337" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#c9a96e" stop-opacity="0.15" />
    </linearGradient>
    <radialGradient id="ambientWine" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#881337" stop-opacity="0.32" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="ambientGold" cx="50%" cy="50%" r="42%">
      <stop offset="0%" stop-color="#c9a96e" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
    <filter id="subtleShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.75" />
    </filter>
  </defs>

  <!-- Luxury Velvet Rounded Base -->
  <rect width="512" height="512" rx="116" fill="url(#bgGrad)" />

  <!-- Ambient Seductive Glow -->
  <circle cx="256" cy="256" r="230" fill="url(#ambientWine)" />
  <circle cx="256" cy="256" r="170" fill="url(#ambientGold)" />

  <!-- Fine Satin Gold Rim -->
  <rect x="5" y="5" width="502" height="502" rx="112" fill="none" stroke="url(#rimGrad)" stroke-width="3" />

  <!-- Center Haute Monogram 'V' -->
  <text x="256" y="272" class="monogram-v" fill="url(#velourGold)" filter="url(#subtleShadow)">V</text>
</svg>
'''
    return svg_content

def generate_master_png():
    size = 1024
    radius = 232

    # 1. Base dark background with rounded mask
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))

    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=radius, fill=255)

    # 2. Gradient background: from #151413 down to #040404
    bg = Image.new('RGBA', (size, size), (7, 7, 7, 255))
    bg_draw = ImageDraw.Draw(bg)
    for y in range(size):
        factor = y / float(size)
        r = int(20 * (1 - factor) + 4 * factor)
        g = int(18 * (1 - factor) + 4 * factor)
        b = int(16 * (1 - factor) + 4 * factor)
        bg_draw.line([(0, y), (size, y)], fill=(r, g, b, 255))

    # 3. Ambient lighting (Candlelight Amber & Velvet Wine)
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse([(size//5, size//5), (4*size//5, 4*size//5)], fill=(136, 19, 55, 65))
    glow_draw.ellipse([(size//3, size//3), (2*size//3, 2*size//3)], fill=(201, 169, 110, 75))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=110))
    bg.alpha_composite(glow)

    # 4. Delicate Rim Border
    rim = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    rim_draw = ImageDraw.Draw(rim)
    rim_draw.rounded_rectangle(
        [(10, 10), (size - 11, size - 11)],
        radius=radius - 4,
        outline=(201, 169, 110, 95),
        width=6
    )
    bg.alpha_composite(rim)

    # 5. Serif 'V' with Cormorant Garamond
    font = ImageFont.truetype(FONT_TTF, 720)
    bbox = font.getbbox('V')
    bw = bbox[2] - bbox[0]
    bh = bbox[3] - bbox[1]
    vx = (size - bw) // 2 - bbox[0]
    vy = (size - bh) // 2 - bbox[1] - 16

    # Text mask with slight optical stroke reinforcement (8px on 1024)
    text_mask = Image.new('L', (size, size), 0)
    t_draw = ImageDraw.Draw(text_mask)
    t_draw.text((vx, vy), 'V', font=font, fill=255, stroke_width=8)

    # Drop shadow
    shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    s_draw.text((vx, vy + 14), 'V', font=font, fill=(0, 0, 0, 180), stroke_width=8)
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=18))
    bg.alpha_composite(shadow)

    # Gold gradient fill for the 'V'
    # Highlights: #faeed7 -> Mid: #dfbd83 / #c9a96e -> Deep: #825e24
    gold_text = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    g_draw = ImageDraw.Draw(gold_text)
    y_start = bbox[1] + vy - 20
    y_end = bbox[3] + vy + 20
    span = float(max(1, y_end - y_start))

    for y in range(max(0, y_start), min(size, y_end + 1)):
        t = (y - y_start) / span
        if t < 0.3:
            st = t / 0.3
            r = int(251 * (1 - st) + 228 * st)
            g = int(242 * (1 - st) + 195 * st)
            b = int(227 * (1 - st) + 141 * st)
        elif t < 0.7:
            st = (t - 0.3) / 0.4
            r = int(228 * (1 - st) + 201 * st)
            g = int(195 * (1 - st) + 169 * st)
            b = int(141 * (1 - st) + 110 * st)
        else:
            st = (t - 0.7) / 0.3
            r = int(201 * (1 - st) + 130 * st)
            g = int(169 * (1 - st) + 94 * st)
            b = int(110 * (1 - st) + 40 * st)
        g_draw.line([(0, y), (size, y)], fill=(r, g, b, 255))

    final_text = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    final_text.paste(gold_text, (0, 0), text_mask)
    bg.alpha_composite(final_text)

    # Apply squircle mask
    img.paste(bg, (0, 0), mask)
    return img

def main():
    print("Generating Velour luxury favicon assets...")
    svg_data = generate_svg()
    master_png = generate_master_png()

    manifest_json = '''{
  "name": "Velour",
  "short_name": "Velour",
  "icons": [
    {
      "src": "/web-app-manifest-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/web-app-manifest-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "theme_color": "#070707",
  "background_color": "#070707",
  "display": "standalone"
}
'''

    # Generate resized variants
    png_512 = master_png.resize((512, 512), Image.Resampling.LANCZOS)
    png_192 = master_png.resize((192, 192), Image.Resampling.LANCZOS)
    png_180 = master_png.resize((180, 180), Image.Resampling.LANCZOS)
    png_96 = master_png.resize((96, 96), Image.Resampling.LANCZOS)
    png_48 = master_png.resize((48, 48), Image.Resampling.LANCZOS)
    png_32 = master_png.resize((32, 32), Image.Resampling.LANCZOS)
    png_16 = master_png.resize((16, 16), Image.Resampling.LANCZOS)

    for target_dir in TARGET_DIRS:
        os.makedirs(target_dir, exist_ok=True)
        print(f"Writing assets to: {target_dir}")

        # 1. favicon.svg
        svg_path = os.path.join(target_dir, 'favicon.svg')
        with open(svg_path, 'w', encoding='utf-8') as f:
            f.write(svg_data)

        # 2. site.webmanifest
        manifest_path = os.path.join(target_dir, 'site.webmanifest')
        with open(manifest_path, 'w', encoding='utf-8') as f:
            f.write(manifest_json)

        # 3. PNGs
        png_512.save(os.path.join(target_dir, 'web-app-manifest-512x512.png'), format='PNG')
        png_192.save(os.path.join(target_dir, 'web-app-manifest-192x192.png'), format='PNG')
        png_180.save(os.path.join(target_dir, 'apple-touch-icon.png'), format='PNG')
        png_96.save(os.path.join(target_dir, 'favicon-96x96.png'), format='PNG')

        # 4. Multi-res favicon.ico (16, 32, 48)
        ico_path = os.path.join(target_dir, 'favicon.ico')
        png_48.save(
            ico_path,
            format='ICO',
            sizes=[(16, 16), (32, 32), (48, 48)],
            append_images=[png_32, png_16]
        )

    print("All favicon assets generated successfully!")

if __name__ == '__main__':
    main()
