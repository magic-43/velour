import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_TTF = os.path.join(SCRIPT_DIR, 'cormorant.ttf')
RES_DIR = os.path.join(SCRIPT_DIR, 'android', 'app', 'src', 'main', 'res')

def create_gold_gradient(height):
    """Creates a 1D gradient array: Champagne #faeed7 -> Satin Gold #c9a96e -> Deep Bronze #8e682e"""
    colors = []
    for y in range(height):
        t = y / max(1, height - 1)
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
        colors.append((r, g, b, 255))
    return colors

def render_master_emblem(size=512):
    """Renders the standalone luxury Velour V emblem on a transparent square canvas."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    radius = int(size * 0.22)

    # 1. Squircle background
    mask = Image.new('L', (size, size), 0)
    m_draw = ImageDraw.Draw(mask)
    m_draw.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=radius, fill=255)

    bg = Image.new('RGBA', (size, size), (7, 7, 7, 255))
    bg_draw = ImageDraw.Draw(bg)
    for y in range(size):
        factor = y / float(size)
        r = int(20 * (1 - factor) + 4 * factor)
        g = int(18 * (1 - factor) + 4 * factor)
        b = int(16 * (1 - factor) + 4 * factor)
        bg_draw.line([(0, y), (size, y)], fill=(r, g, b, 255))

    # Ambient glow
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    g_draw = ImageDraw.Draw(glow)
    g_draw.ellipse([(size//5, size//5), (4*size//5, 4*size//5)], fill=(136, 19, 55, 75))
    g_draw.ellipse([(size//3, size//3), (2*size//3, 2*size//3)], fill=(201, 169, 110, 85))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=int(size * 0.11)))
    bg.alpha_composite(glow)

    # Rim border
    rim = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    r_draw = ImageDraw.Draw(rim)
    rim_w = max(2, int(size * 0.007))
    r_draw.rounded_rectangle(
        [(rim_w, rim_w), (size - 1 - rim_w, size - 1 - rim_w)],
        radius=radius - 2,
        outline=(201, 169, 110, 110),
        width=rim_w
    )
    bg.alpha_composite(rim)

    # Monogram V
    font_size = int(size * 0.70)
    font = ImageFont.truetype(FONT_TTF, font_size)
    bbox = font.getbbox('V')
    bw = bbox[2] - bbox[0]
    bh = bbox[3] - bbox[1]
    vx = (size - bw) // 2 - bbox[0]
    vy = (size - bh) // 2 - bbox[1] - int(size * 0.015)

    stroke_w = max(1, int(size * 0.008))
    text_mask = Image.new('L', (size, size), 0)
    t_draw = ImageDraw.Draw(text_mask)
    t_draw.text((vx, vy), 'V', font=font, fill=255, stroke_width=stroke_w)

    shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    s_draw.text((vx, vy + int(size * 0.015)), 'V', font=font, fill=(0, 0, 0, 200), stroke_width=stroke_w)
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=int(size * 0.018)))
    bg.alpha_composite(shadow)

    # Gold fill
    gold_gradient = create_gold_gradient(bh + 40)
    gold_surface = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gs_draw = ImageDraw.Draw(gold_surface)
    y_start = bbox[1] + vy - 20
    for idx, col in enumerate(gold_gradient):
        curr_y = y_start + idx
        if 0 <= curr_y < size:
            gs_draw.line([(0, curr_y), (size, curr_y)], fill=col)

    final_text = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    final_text.paste(gold_surface, (0, 0), text_mask)
    bg.alpha_composite(final_text)

    img.paste(bg, (0, 0), mask)
    return img

def render_adaptive_foreground(size=432):
    """Renders the adaptive icon foreground (emblem centered in the safe circle zone ~66%)."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    emblem_size = int(size * 0.64)
    emblem = render_master_emblem(emblem_size)
    offset = (size - emblem_size) // 2
    img.paste(emblem, (offset, offset), emblem)
    return img

def render_round_icon(emblem_img):
    """Crops an emblem image into a perfect circle."""
    size = emblem_img.width
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse([(0, 0), (size - 1, size - 1)], fill=255)
    
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(emblem_img, (0, 0), mask)
    return out

def draw_tracked_text(draw, font, text, center_x, center_y, fill, tracking=0.25):
    """Draws uppercase text with generous luxury letter spacing."""
    chars = list(text)
    char_widths = []
    for c in chars:
        bbox = font.getbbox(c)
        char_widths.append(bbox[2] - bbox[0])
    
    em_size = font.size
    letter_spacing = int(em_size * tracking)
    total_w = sum(char_widths) + letter_spacing * (len(chars) - 1)
    
    curr_x = center_x - total_w // 2
    for idx, c in enumerate(chars):
        bbox = font.getbbox(c)
        draw.text((curr_x - bbox[0], center_y - bbox[1]), c, font=font, fill=fill)
        curr_x += char_widths[idx] + letter_spacing

def render_splash_screen(width, height):
    """Renders full splash screen with centered emblem + 'VELOUR' + 'HOUSE OF DESIRE'."""
    img = Image.new('RGBA', (width, height), (7, 7, 7, 255))
    draw = ImageDraw.Draw(img)

    # Subtle ambient lighting in center
    cx, cy = width // 2, int(height * 0.44)
    glow_radius = int(min(width, height) * 0.50)
    glow = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    g_draw = ImageDraw.Draw(glow)
    g_draw.ellipse(
        [(cx - glow_radius, cy - glow_radius), (cx + glow_radius, cy + glow_radius)],
        fill=(136, 19, 55, 45)
    )
    g_draw.ellipse(
        [(cx - glow_radius//2, cy - glow_radius//2), (cx + glow_radius//2, cy + glow_radius//2)],
        fill=(201, 169, 110, 50)
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=int(min(width, height) * 0.16)))
    img.alpha_composite(glow)

    # Centered Emblem
    emblem_size = int(min(width, height) * 0.32)
    emblem_size = max(110, min(emblem_size, 260))
    emblem = render_master_emblem(emblem_size)
    emblem_x = (width - emblem_size) // 2
    emblem_y = cy - (emblem_size // 2) - int(min(width, height) * 0.05)
    img.paste(emblem, (emblem_x, emblem_y), emblem)

    # "VELOUR" text
    title_font_size = max(24, int(min(width, height) * 0.058))
    title_font = ImageFont.truetype(FONT_TTF, title_font_size)
    title_y = emblem_y + emblem_size + int(min(width, height) * 0.045)
    draw_tracked_text(draw, title_font, "VELOUR", width // 2, title_y, fill=(240, 236, 228, 240), tracking=0.35)

    # Subtitle "HOUSE OF DESIRE"
    sub_font_size = max(11, int(title_font_size * 0.36))
    sub_font = ImageFont.truetype(FONT_TTF, sub_font_size)
    sub_y = title_y + title_font_size + int(min(width, height) * 0.02)
    draw_tracked_text(draw, sub_font, "HOUSE OF DESIRE", width // 2, sub_y, fill=(201, 169, 110, 190), tracking=0.45)

    return img

def main():
    print("Generating Android App Icons and Splash Screens for Velour...")

    master_icon = render_master_emblem(512)
    master_foreground = render_adaptive_foreground(432)

    # Densities for launcher icons
    icon_densities = {
        'mipmap-mdpi': (48, 108),
        'mipmap-hdpi': (72, 162),
        'mipmap-xhdpi': (96, 216),
        'mipmap-xxhdpi': (144, 324),
        'mipmap-xxxhdpi': (192, 432),
    }

    for folder, (icon_sz, fg_sz) in icon_densities.items():
        out_dir = os.path.join(RES_DIR, folder)
        os.makedirs(out_dir, exist_ok=True)

        # 1. ic_launcher.png (squircle)
        sq_icon = master_icon.resize((icon_sz, icon_sz), Image.Resampling.LANCZOS)
        sq_icon.save(os.path.join(out_dir, 'ic_launcher.png'), format='PNG')

        # 2. ic_launcher_round.png (circle)
        rd_icon = render_round_icon(sq_icon)
        rd_icon.save(os.path.join(out_dir, 'ic_launcher_round.png'), format='PNG')

        # 3. ic_launcher_foreground.png
        fg_icon = master_foreground.resize((fg_sz, fg_sz), Image.Resampling.LANCZOS)
        fg_icon.save(os.path.join(out_dir, 'ic_launcher_foreground.png'), format='PNG')
        print(f"Generated icons for {folder} (icon: {icon_sz}x{icon_sz}, fg: {fg_sz}x{fg_sz})")

    # Splash screen resolutions
    splash_port_res = {
        'drawable-port-mdpi': (320, 480),
        'drawable-port-hdpi': (480, 800),
        'drawable-port-xhdpi': (720, 1280),
        'drawable-port-xxhdpi': (960, 1600),
        'drawable-port-xxxhdpi': (1280, 1920),
    }

    splash_land_res = {
        'drawable-land-mdpi': (480, 320),
        'drawable-land-hdpi': (800, 480),
        'drawable-land-xhdpi': (1280, 720),
        'drawable-land-xxhdpi': (1600, 960),
        'drawable-land-xxxhdpi': (1920, 1280),
    }

    for folder, (w, h) in splash_port_res.items():
        out_dir = os.path.join(RES_DIR, folder)
        os.makedirs(out_dir, exist_ok=True)
        splash_img = render_splash_screen(w, h)
        splash_img.save(os.path.join(out_dir, 'splash.png'), format='PNG')
        print(f"Generated portrait splash for {folder} ({w}x{h})")

    for folder, (w, h) in splash_land_res.items():
        out_dir = os.path.join(RES_DIR, folder)
        os.makedirs(out_dir, exist_ok=True)
        splash_img = render_splash_screen(w, h)
        splash_img.save(os.path.join(out_dir, 'splash.png'), format='PNG')
        print(f"Generated landscape splash for {folder} ({w}x{h})")

    print("All Android launcher icons and splash screens generated successfully!")

if __name__ == '__main__':
    main()
