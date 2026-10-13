import os
from PIL import Image

W, H = 64, 64

PALETTE = {
    '.': (255, 255, 255, 255),  # Pure solid White background (#FFFFFF)
    'T': (0, 0, 0, 0),          # Transparent
    '0': (18, 22, 42, 255),     # Single-pixel Outline Dark (#12162A)
    '1': (18, 21, 40, 255),     # Screen Base Dark Navy (#121528)
    '2': (59, 114, 222, 255),   # Chassis Cobalt Blue (#3B72DE)
    '3': (33, 67, 156, 255),    # Chassis Deep Blue Shadow (#21439C)
    '4': (106, 157, 248, 255),  # Chassis Sky Blue Highlight (#6A9DF8)
    '5': (255, 255, 255, 255),  # Pure White Plate (#FFFFFF)
    '6': (232, 238, 248, 255),  # Off-White Casing (#E8EEF8)
    '7': (170, 185, 210, 255),  # Cool Plate Shade (#AAB9D2)
    '8': (0, 240, 255, 255),    # Cyan LED Screen Glow (#00F0FF)
    '9': (140, 250, 255, 255),  # Bright Cyan Highlight (#8CFAFF)
    'A': (14, 130, 200, 255),   # Deep Cyan (#0E82C8)
    'B': (253, 224, 71, 255),   # Gemini Star Yellow (#FDE047)
    'C': (245, 158, 11, 255),   # Gemini Star Amber (#F59E0B)
    'D': (255, 252, 210, 255),  # Gemini Star Spark Core (#FFFCDE)
    'E': (27, 30, 54, 255),     # Ground Shadow Solid (#1B1E36)
    'F': (56, 189, 248, 255),   # Ring Cyan Light (#38BDF8)
}

grid = [['.' for _ in range(W)] for _ in range(H)]

def set_p(x, y, token):
    if 0 <= x < W and 0 <= y < H:
        grid[y][x] = token

def hline(y, x1, x2, token):
    for x in range(x1, x2 + 1):
        set_p(x, y, token)

# ==============================================================================
# 1. GROUND SHADOW (Y=56..59, Center X=31.5)
# Smooth, continuous dark oval on ground. Zero noise.
# ==============================================================================
hline(56, 24, 39, '0')
set_p(22, 57, '0')
set_p(23, 57, '0')
hline(57, 24, 39, 'E')
set_p(40, 57, '0')
set_p(41, 57, '0')

set_p(21, 58, '0')
hline(58, 22, 41, 'E')
set_p(42, 58, '0')

set_p(22, 59, '0')
set_p(23, 59, '0')
hline(59, 24, 39, 'E')
set_p(40, 59, '0')
set_p(41, 59, '0')
hline(60, 24, 39, '0')


# ==============================================================================
# 2. ANTI-GRAVITY LEVITATION RING (Y=48..52, Center X=31.5)
# Perfectly smoothed ellipse ring of cyan & white. No loose particles!
# ==============================================================================
# Outer top outline
hline(48, 23, 40, '0')

# Y=49 upper rim
set_p(20, 49, '0')
set_p(21, 49, '0')
set_p(22, 49, '8')
hline(49, 23, 27, 'F')
hline(49, 28, 35, '9')
hline(49, 36, 40, 'F')
set_p(41, 49, '8')
set_p(42, 49, '0')
set_p(43, 49, '0')

# Y=50 inner energy core
set_p(19, 50, '0')
set_p(20, 50, '8')
hline(50, 21, 23, 'F')
hline(50, 24, 39, '5') # Pure white energetic core
hline(50, 40, 42, 'F')
set_p(43, 50, '8')
set_p(44, 50, '0')

# Y=51 lower glow band
set_p(20, 51, '0')
set_p(21, 51, 'A')
hline(51, 22, 25, '8')
hline(51, 26, 37, 'F')
hline(51, 38, 41, '8')
set_p(42, 51, 'A')
set_p(43, 51, '0')

# Y=52 bottom outline
hline(52, 23, 40, '0')


# ==============================================================================
# 3. LOWER TORSO / CHASSIS (Y=33..46)
# ==============================================================================
# Keel bottom at Y=46..45
hline(46, 28, 35, '0')
set_p(26, 45, '0')
set_p(27, 45, '0')
hline(45, 28, 35, '3') # Deep shadow keel
set_p(36, 45, '0')
set_p(37, 45, '0')

# Lower belly (Y=44)
set_p(24, 44, '0')
set_p(25, 44, '0')
hline(44, 26, 28, '3')
hline(44, 29, 34, '7') # Shaded white plate
hline(44, 35, 37, '3')
set_p(38, 44, '0')
set_p(39, 44, '0')

# White belly plate contour (Y=41..43)
set_p(22, 43, '0')
set_p(23, 43, '0')
hline(43, 24, 26, '3')
hline(43, 27, 36, '6') # Offwhite belly
hline(43, 37, 39, '3')
set_p(40, 43, '0')
set_p(41, 43, '0')

set_p(21, 42, '0')
hline(42, 22, 24, '2')
hline(42, 25, 38, '6')
hline(42, 39, 41, '3')
set_p(42, 42, '0')

set_p(21, 41, '0')
hline(41, 22, 24, '2')
hline(41, 25, 38, '5') # Pure white belly center
hline(41, 39, 41, '3')
set_p(42, 41, '0')

# Chest plate sides (Y=34..40)
for y in range(34, 41):
    set_p(21, y, '0')
    hline(y, 22, 41, '2')
    set_p(42, y, '0')
    # Right side shading
    hline(y, 39, 41, '3')

# GEMINI 4-POINTED SPARK STAR (Y=35..39, Center X=31.5)
# Symmetrical diamond spark:
# Top: Amber/Yellow (B/C)
# Left: Amber/Yellow (B/C)
# Right: Cyan/Blue (8/A)
# Bottom: Cyan/Blue (8/A)
# Center: Spark White (D/5)
set_p(31, 35, 'C')
set_p(32, 35, 'C')

set_p(30, 36, 'C')
set_p(31, 36, 'B')
set_p(32, 36, 'B')
set_p(33, 36, '8')

# Star horizontal rays (Y=37)
set_p(27, 37, 'C')
set_p(28, 37, 'C')
set_p(29, 37, 'B')
set_p(30, 37, 'D')
set_p(31, 37, '5') # Pure white core
set_p(32, 37, '5')
set_p(33, 37, 'D')
set_p(34, 37, '8')
set_p(35, 37, '8')
set_p(36, 37, 'A')

# Bottom diamond
set_p(30, 38, 'C')
set_p(31, 38, '8')
set_p(32, 38, '8')
set_p(33, 38, 'A')

set_p(31, 39, 'A')
set_p(32, 39, 'A')

# Neck mechanical seam (Y=33)
hline(33, 23, 40, '0')


# ==============================================================================
# 4. DETACHED FLOATING HANDS (Left: X=13..20, Right: X=43..50, Y=36..45)
# Cute detached mitten manipulators with clean 1px outlines and knuckles
# ==============================================================================
# LEFT HAND (angled towards lower-left)
# Y=36: cuff top
hline(36, 16, 19, '0')
# Y=37: white back of wrist
set_p(15, 37, '0')
hline(37, 16, 19, '5')
set_p(20, 37, '0')
# Y=38..40: mitten body with clean curve
for y in (38, 39, 40):
    set_p(14, y, '0')
    hline(y, 15, 19, '5' if y < 40 else '6')
    set_p(20, y, '0')
# Y=41: knuckle crease & blue finger band
set_p(14, 41, '0')
set_p(15, 41, '2')
set_p(16, 41, '2')
set_p(17, 41, '0') # Knuckle seam
set_p(18, 41, '2')
set_p(19, 41, '2')
set_p(20, 41, '0')
# Y=42..43: curved robotic fingers
for y in (42, 43):
    set_p(15, y, '0')
    hline(y, 16, 18, '3')
    set_p(19, y, '0')
# Y=44: tip
hline(44, 16, 18, '0')

# RIGHT HAND (symmetrical with shadow shading)
hline(36, 44, 47, '0')
set_p(43, 37, '0')
hline(37, 44, 47, '6')
set_p(48, 37, '0')
for y in (38, 39, 40):
    set_p(43, y, '0')
    hline(y, 44, 48, '6' if y < 40 else '7')
    set_p(49, y, '0')
set_p(43, 41, '0')
set_p(44, 41, '3')
set_p(45, 41, '3')
set_p(46, 41, '0') # Knuckle seam
set_p(47, 41, '3')
set_p(48, 41, '3')
set_p(49, 41, '0')
for y in (42, 43):
    set_p(44, y, '0')
    hline(y, 45, 47, '3')
    set_p(48, y, '0')
hline(44, 45, 47, '0')


# ==============================================================================
# 5. HEAD, HELMET, EAR PODS & ANTENNA (Y=7..32)
# ==============================================================================
# ANTENNA ON TOP-LEFT (X=17..20, Y=6..10)
# Clean continuous angled antenna firmly attached to helmet dome:
# Tip:
set_p(17, 6, '0')
set_p(18, 6, '0')
set_p(16, 7, '0')
set_p(17, 7, '4') # Bright sky blue tip
set_p(18, 7, '4')
set_p(19, 7, '0')
# Stalk:
set_p(16, 8, '0')
set_p(17, 8, '2')
set_p(18, 8, '2')
set_p(19, 8, '0')
set_p(17, 9, '0')
set_p(18, 9, '3')
set_p(19, 9, '2')
set_p(20, 9, '0')
set_p(18, 10, '0')
set_p(19, 10, '3')

# HELMET DOME TOP (Y=8..10)
hline(8, 26, 37, '0')
set_p(24, 9, '0')
set_p(25, 9, '0')
hline(9, 26, 37, '4') # Sky blue highlight band
set_p(38, 9, '0')
set_p(39, 9, '0')

set_p(22, 10, '0')
set_p(23, 10, '0')
hline(10, 24, 39, '2')
set_p(40, 10, '0')
set_p(41, 10, '0')

# DOME & WHITE VISOR FRAME OUTER CONTOUR (Y=11..32)
# Width expands smoothly:
for y in range(11, 16):
    lx = 20 if y == 11 else (19 if y == 12 else (18 if y == 13 else 17))
    rx = 43 if y == 11 else (44 if y == 12 else (45 if y == 13 else 46))
    set_p(lx, y, '0')
    set_p(rx, y, '0')
    # Helmet top blue transition
    hline(y, lx + 1, rx - 1, '2')
    # Highlight
    hline(y, 25, 38, '4' if y < 13 else '2')

# SIDE EAR CYLINDERS (PODS) (Left: X=13..17, Right: X=46..50, Y=17..26)
for y in range(17, 27):
    # Left ear pod bulge
    set_p(13 if 19 <= y <= 24 else 14, y, '0')
    # Right ear pod bulge
    set_p(50 if 19 <= y <= 24 else 49, y, '0')

    # Fill left ear pod with cobalt blue & highlight
    x_start = 14 if 19 <= y <= 24 else 15
    hline(y, x_start, 17, '4' if y < 21 else ('2' if y < 24 else '3'))

    # Fill right ear pod with cobalt blue & shadow
    x_end = 49 if 19 <= y <= 24 else 48
    hline(y, 46, x_end, '2' if y < 21 else '3')

# WHITE PROTECTIVE BEZEL FRAME (encapsulating screen) (Y=14..32)
for y in range(14, 33):
    lx = 17 if (16 <= y <= 27) else (18 if y in (15, 28, 29) else 19)
    rx = 46 if (16 <= y <= 27) else (45 if y in (15, 28, 29) else 44)
    set_p(lx, y, '0')
    set_p(rx, y, '0')

# Bezel forehead (Y=14..16)
hline(14, 20, 43, '5')
hline(15, 19, 44, '5')
hline(16, 18, 45, '5')

# Bezel cheeks (Y=17..28)
for y in range(17, 29):
    hline(y, 18, 21, '5' if y < 24 else '6')
    hline(y, 42, 45, '6' if y < 24 else '7')

# Bezel chin (Y=29..32)
for y in range(29, 33):
    hline(y, 19, 44, '6' if y < 31 else '7')
hline(33, 20, 43, '0')


# ==============================================================================
# 6. DARK VISOR SCREEN (X=22..41, Y=17..28, Width 20, Height 12)
# ==============================================================================
hline(17, 23, 40, '0')
for y in range(18, 28):
    set_p(22, y, '0')
    hline(y, 23, 40, '1') # Solid dark navy-black screen
    set_p(41, y, '0')
hline(28, 23, 40, '0')

# Rounded screen corners
set_p(23, 18, '0')
set_p(40, 18, '0')
set_p(23, 27, '0')
set_p(40, 27, '0')

# Subtle glass glare reflection (top-right inner rim)
set_p(38, 19, '3')
set_p(39, 19, '4')
set_p(39, 20, '3')


# ==============================================================================
# 7. CYAN ARC LED EYES (^ ^) (Pixel-perfect symmetrical glowing arcs)
# ==============================================================================
# LEFT EYE ARC (X=25..29, Y=21..24)
# Clean 2-pixel wide apex, smooth 1-pixel descent
hline(21, 26, 28, '8')
set_p(27, 21, '9') # Center highlight

set_p(25, 22, '8')
set_p(26, 22, '9')
set_p(27, 22, '9')
set_p(28, 22, '9')
set_p(29, 22, '8')

set_p(25, 23, '8')
set_p(29, 23, '8')

set_p(25, 24, '8')
set_p(29, 24, '8')

# RIGHT EYE ARC (X=34..38, Y=21..24)
# Perfectly symmetrical
hline(21, 35, 37, '8')
set_p(36, 21, '9') # Center highlight

set_p(34, 22, '8')
set_p(35, 22, '9')
set_p(36, 22, '9')
set_p(37, 22, '9')
set_p(38, 22, '8')

set_p(34, 23, '8')
set_p(38, 23, '8')

set_p(34, 24, '8')
set_p(38, 24, '8')


# ==============================================================================
# 8. EXPORT ARTISAN ASSETS
# ==============================================================================
def render_image(scale=8, transparent=False):
    img = Image.new('RGBA', (W * scale, H * scale), (255, 255, 255, 255) if not transparent else (0, 0, 0, 0))
    pixels = img.load()
    for y in range(H):
        for x in range(W):
            token = grid[y][x]
            if transparent and token == '.':
                color = (0, 0, 0, 0)
            else:
                color = PALETTE[token]
            for sy in range(scale):
                for sx in range(scale):
                    pixels[x * scale + sx, y * scale + sy] = color
    return img

# Save all resolutions
os.makedirs('d:/Projects/AG_Pet/assets/clean', exist_ok=True)

# 512x512 on pure white background (#FFFFFF) - Primary user request
img_white_512 = render_image(scale=8, transparent=False)
img_white_512.save('d:/Projects/AG_Pet/gravi_clean_asset.png')
img_white_512.save('d:/Projects/AG_Pet/assets/clean/gravi_clean_asset_512.png')

# 64x64 on pure white
img_white_64 = render_image(scale=1, transparent=False)
img_white_64.save('d:/Projects/AG_Pet/assets/clean/gravi_clean_64.png')

# 512x512 transparent
img_trans_512 = render_image(scale=8, transparent=True)
img_trans_512.save('d:/Projects/AG_Pet/gravi_transparent_512.png')
img_trans_512.save('d:/Projects/AG_Pet/assets/clean/gravi_transparent_512.png')

# 1024x1024 high-res master
img_white_1024 = render_image(scale=16, transparent=False)
img_white_1024.save('d:/Projects/AG_Pet/gravi_clean_asset_1024.png')

print("Perfect Gravi 2D sprite generated successfully!")
