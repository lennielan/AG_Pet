import os
from PIL import Image

# 64x64 Canvas Definition
W, H = 64, 64

PALETTE = {
    '.': (255, 255, 255, 255),  # White background (#FFFFFF)
    'T': (0, 0, 0, 0),          # Transparent
    '0': (18, 22, 42, 255),     # Outline Dark (#12162A)
    '1': (20, 23, 43, 255),     # Screen Base Navy (#14172B)
    '2': (59, 114, 222, 255),   # Chassis Cobalt Blue (#3B72DE)
    '3': (36, 76, 168, 255),    # Chassis Deep Blue Shadow (#244CA8)
    '4': (99, 151, 242, 255),   # Chassis Sky Blue Light (#6397F2)
    '5': (255, 255, 255, 255),  # Pure White (#FFFFFF)
    '6': (230, 237, 248, 255),  # Off-White (#E6EDF8)
    '7': (162, 178, 204, 255),  # Shaded Gray (#A2B2CC)
    '8': (0, 240, 255, 255),    # Cyan Glow / Screen Eyes (#00F0FF)
    '9': (125, 249, 255, 255),  # Bright Cyan Highlight (#7DF9FF)
    'A': (14, 165, 233, 255),   # Deep Cyan (#0EA5E9)
    'B': (253, 224, 71, 255),   # Star Yellow (#FDE047)
    'C': (245, 158, 11, 255),   # Star Amber (#F59E0B)
    'D': (254, 249, 195, 255),  # Star Spark Center (#FEF9C3)
    'E': (30, 34, 56, 255),     # Solid Ground Shadow (#1E2238)
    'F': (56, 189, 248, 255),   # Ring Accent Cyan (#38BDF8)
}

# 64 rows of 64 characters
# Grid: X=0..63, Y=0..63
grid = [['.' for _ in range(W)] for _ in range(H)]

def set_p(x, y, token):
    if 0 <= x < W and 0 <= y < H:
        grid[y][x] = token

def hline(y, x1, x2, token):
    for x in range(x1, x2 + 1):
        set_p(x, y, token)

# --- 1. SHADOW (Y=56..59, Width ~22) ---
# Clean continuous dark oval strictly underneath
hline(56, 26, 37, '0')
for y in (57, 58):
    set_p(23, y, '0')
    set_p(24, y, '0')
    hline(y, 25, 38, 'E')
    set_p(39, y, '0')
    set_p(40, y, '0')
hline(59, 26, 37, '0')

# --- 2. LEVITATION RING (Y=49..52, Width ~24) ---
# Smooth oval anti-gravity ring of cyan, white, and outline pixels. No messy particles!
# Y=49: top border of ring
hline(49, 24, 39, '0')
# Y=50: upper rim
set_p(21, 50, '0')
set_p(22, 50, '0')
hline(50, 23, 25, '8')
hline(50, 26, 37, '9')
hline(50, 38, 40, '8')
set_p(41, 50, '0')
set_p(42, 50, '0')
# Y=51: lower rim with core
set_p(20, 51, '0')
set_p(21, 51, '8')
hline(51, 22, 24, '9')
hline(51, 25, 38, '5') # Bright white energy core
hline(51, 39, 41, '9')
set_p(42, 51, '8')
set_p(43, 51, '0')
# Y=52: bottom border
set_p(21, 52, '0')
set_p(22, 52, '0')
hline(52, 23, 26, 'A')
hline(52, 27, 36, '8')
hline(52, 37, 40, 'A')
set_p(41, 52, '0')
set_p(42, 52, '0')
# Y=53: closing bottom line
hline(53, 24, 39, '0')

# --- 3. BODY / TORSO (Y=32..46) ---
# Keel bottom at Y=46..45
hline(46, 28, 35, '0')
hline(45, 25, 27, '0')
hline(45, 28, 35, '3') # Dark blue keel
hline(45, 36, 38, '0')

# Lower belly (Y=43..44)
set_p(23, 44, '0')
set_p(24, 44, '0')
hline(44, 25, 27, '3')
hline(44, 28, 35, '7') # Shaded white plate
hline(44, 36, 38, '3')
set_p(39, 44, '0')
set_p(40, 44, '0')

set_p(22, 43, '0')
hline(43, 23, 25, '3')
hline(43, 26, 37, '6') # Offwhite belly
hline(43, 38, 40, '3')
set_p(41, 43, '0')

# Mid torso (Y=40..42)
set_p(21, 42, '0')
hline(42, 22, 24, '3')
hline(42, 25, 38, '6') # White belly plate
hline(42, 39, 41, '3')
set_p(42, 42, '0')

set_p(21, 41, '0')
hline(41, 22, 24, '2')
hline(41, 25, 38, '6')
hline(41, 39, 41, '2')
set_p(42, 41, '0')

set_p(21, 40, '0')
hline(40, 22, 24, '2')
hline(40, 25, 38, '2')
hline(40, 39, 41, '2')
set_p(42, 40, '0')

# Chest area with GEMINI SPARK STAR (Y=35..39)
# Star center is at X=31..32, Y=37
for y in (37, 38, 39):
    set_p(21, y, '0')
    hline(y, 22, 41, '2')
    set_p(42, y, '0')

# Draw the 4-pointed Gemini Spark Star on chest
# Y=35: top tip
set_p(31, 35, 'C')
set_p(32, 35, 'C')
# Y=36: upper diamond
set_p(30, 36, 'C')
set_p(31, 36, 'B')
set_p(32, 36, 'B')
set_p(33, 36, 'C')
# Y=37: horizontal wings & core
set_p(27, 37, 'C')
set_p(28, 37, 'B')
set_p(29, 37, 'B')
set_p(30, 37, 'D') # Spark white center
set_p(31, 37, 'D')
set_p(32, 37, 'D')
set_p(33, 37, 'D')
set_p(34, 37, '8') # Cyan right wing
set_p(35, 37, '8')
set_p(36, 37, 'A')
# Y=38: lower diamond
set_p(29, 38, 'C')
set_p(30, 38, 'B')
set_p(31, 38, '8') # Cyan lower glow
set_p(32, 38, '8')
set_p(33, 38, 'A')
set_p(34, 38, 'A')
# Y=39: bottom tip
set_p(31, 39, 'A')
set_p(32, 39, 'A')

# Upper chest (Y=34..36)
for y in (34, 35, 36):
    set_p(22, y, '0')
    set_p(41, y, '0')
hline(34, 23, 40, '2')

# Neck seam (Y=33)
hline(33, 23, 40, '0')

# --- 4. FLOATING HANDS (Left: X=14..21, Right: X=42..49, Y=36..45) ---
# Detached, clearly sculpted robotic mittens/manipulators
def draw_hand(base_x, is_left=True):
    # Base mitten geometry: 7x9 pixels
    # Y=36..37: upper cuff
    hline(36, base_x + 2, base_x + 5, '0')
    set_p(base_x + 1, 37, '0')
    hline(37, base_x + 2, base_x + 5, '6') # White back
    set_p(base_x + 6, 37, '0')

    # Y=38..40: main palm/mitten body
    for y in (38, 39, 40):
        set_p(base_x, y, '0')
        hline(y, base_x + 1, base_x + 5, '5' if y < 40 else '6')
        set_p(base_x + 6, y, '0')

    # Y=41: finger division / blue accent band
    set_p(base_x, 41, '0')
    hline(41, base_x + 1, base_x + 5, '2' if is_left else '3')
    set_p(base_x + 6, 41, '0')

    # Y=42..43: finger segments
    for y in (42, 43):
        set_p(base_x + 1, y, '0')
        hline(y, base_x + 2, base_x + 4, '3')
        set_p(base_x + 5, y, '0')

    # Y=44: bottom fingertip outline
    hline(44, base_x + 2, base_x + 4, '0')

draw_hand(14, is_left=True)
draw_hand(43, is_left=False)

# --- 5. HEAD & HELMET (Y=8..32) ---
# Dome top (Y=8..10)
hline(8, 26, 37, '0')
hline(9, 23, 25, '0')
hline(9, 26, 37, '4') # Crown blue highlight
hline(9, 38, 40, '0')

set_p(21, 10, '0')
set_p(22, 10, '0')
hline(10, 23, 40, '2')
set_p(41, 10, '0')
set_p(42, 10, '0')

# Antenna on Left (X=17..19, Y=6..9)
# Cute clean 1px stalk and 2x2 rounded tip
set_p(17, 6, '0')
set_p(18, 6, '0')
set_p(16, 7, '0')
set_p(17, 7, '4')
set_p(18, 7, '2')
set_p(19, 7, '0')
set_p(17, 8, '0')
set_p(18, 8, '3')
set_p(19, 8, '0')
set_p(18, 9, '0')

# Upper helmet sides & white casing band (Y=11..16)
for y in range(11, 17):
    # Left ear pod & casing
    set_p(19 - (1 if y > 13 else 0), y, '0')
    set_p(44 + (1 if y > 13 else 0), y, '0')

# Ear pods (X=16..19 on left, X=44..47 on right, Y=16..25)
for y in range(17, 26):
    set_p(16, y, '0')
    set_p(47, y, '0')
    # Fill ear pods with blue cylinder shading
    hline(y, 17, 19, '2' if y < 22 else '3')
    hline(y, 44, 46, '3' if y > 20 else '2')

# White visor frame outer contour (Y=11..32)
# The white protective casing wraps around the screen display
for y in range(11, 33):
    lx = 20 if y in (11, 32) else (19 if y in (12, 31) else (18 if y in (13, 30) else 17))
    rx = 43 if y in (11, 32) else (44 if y in (12, 31) else (45 if y in (13, 30) else 46))
    set_p(lx, y, '0')
    set_p(rx, y, '0')

# Fill white helmet frame
for y in range(11, 17):
    hline(y, 21, 24, '5')
    hline(y, 25, 38, '2' if y < 15 else '6') # Top crown blue transition to visor
    hline(y, 39, 42, '7')

for y in range(17, 29):
    # Left white cheek
    hline(y, 18, 21, '6')
    # Right white cheek
    hline(y, 42, 45, '7')

for y in range(29, 33):
    # Bottom white chin
    hline(y, 19, 44, '6' if y < 31 else '7')

# Chin bottom outline
hline(33, 20, 43, '0')

# --- 6. VISOR DISPLAY SCREEN (X=22..41, Y=17..28, Width 20, Height 12) ---
# Dark screen aperture with clean rounded corners
# Inner outline
hline(17, 23, 40, '0')
for y in range(18, 28):
    set_p(22, y, '0')
    hline(y, 23, 40, '1') # Dark navy screen
    set_p(41, y, '0')
hline(28, 23, 40, '0')

# Subtle glass glare on screen (top-right corner)
set_p(38, 19, '2')
set_p(39, 19, '4')
set_p(39, 20, '2')

# --- 7. CYAN ARC EYES (^ ^) (Pixel-perfect, crisp, symmetrical!) ---
# Left eye arc (X=25..29, Y=21..24)
# Arch shape: apex at Y=21, curving down to Y=24
hline(21, 26, 28, '8')
set_p(25, 22, '8')
set_p(26, 22, '9')
set_p(27, 22, '9')
set_p(28, 22, '9')
set_p(29, 22, '8')
set_p(25, 23, '8')
set_p(29, 23, '8')
set_p(25, 24, '8')
set_p(29, 24, '8')

# Right eye arc (X=34..38, Y=21..24)
# Symmetrical arch
hline(21, 35, 37, '8')
set_p(34, 22, '8')
set_p(35, 22, '9')
set_p(36, 22, '9')
set_p(37, 22, '9')
set_p(38, 22, '8')
set_p(34, 23, '8')
set_p(38, 23, '8')
set_p(34, 24, '8')
set_p(38, 24, '8')

# Save 1x, 4x, 8x, 16x images
def render_image(scale=1, transparent=False):
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

os.makedirs('d:/Projects/AG_Pet/assets/clean', exist_ok=True)

# 1. 512x512 on pure white background (#FFFFFF)
img_white_512 = render_image(scale=8, transparent=False)
img_white_512.save('d:/Projects/AG_Pet/gravi_clean_asset.png')
img_white_512.save('d:/Projects/AG_Pet/assets/clean/gravi_clean_512.png')

# 2. 64x64 on pure white
img_white_64 = render_image(scale=1, transparent=False)
img_white_64.save('d:/Projects/AG_Pet/assets/clean/gravi_clean_64.png')

# 3. 512x512 transparent background
img_trans_512 = render_image(scale=8, transparent=True)
img_trans_512.save('d:/Projects/AG_Pet/gravi_transparent_512.png')
img_trans_512.save('d:/Projects/AG_Pet/assets/clean/gravi_transparent_512.png')

print("Pixel-perfect sprites successfully generated!")
