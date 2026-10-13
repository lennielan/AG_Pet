import os
import shutil
from PIL import Image
import numpy as np
from collections import deque

input_path = 'C:/Users/lennielan/.gemini/antigravity/brain/829b2a0e-fac4-4746-92f2-d9d0d1042177/gravi_sprite_pixel_art_1791921025377.jpg'
out_clean_dir = 'd:/Projects/AG_Pet/assets/clean'
renderer_assets_dir = 'd:/Projects/AG_Pet/desktop-overlay/renderer/assets'
dist_assets_dir = 'd:/Projects/AG_Pet/desktop-overlay/dist/desktop-overlay/renderer/assets'
artifact_dir = 'C:/Users/lennielan/.gemini/antigravity/brain/829b2a0e-fac4-4746-92f2-d9d0d1042177'

for d in [out_clean_dir, renderer_assets_dir, dist_assets_dir, artifact_dir]:
    os.makedirs(d, exist_ok=True)

img = Image.open(input_path).convert('RGBA')
arr = np.array(img)
H, W, _ = arr.shape

# 1. Flood-fill from outer image borders to detect exterior background
# Also include known enclosed background cavity seeds (e.g. between antenna stalk and head dome at 271, 117)
is_bg = np.zeros((H, W), dtype=bool)
q = deque()

for x in range(W):
    q.append((x, 0))
    q.append((x, H - 1))
for y in range(H):
    q.append((0, y))
    q.append((W - 1, y))

# Enclosed cavity between antenna stalk and helmet:
q.append((271, 117))

visited = np.zeros((H, W), dtype=bool)

while q:
    x, y = q.popleft()
    if visited[y, x]:
        continue
    visited[y, x] = True
    
    r, g, b, _ = arr[y, x]
    # Background threshold: light pixels on outer boundary and cavities
    if r >= 225 and g >= 225 and b >= 225:
        is_bg[y, x] = True
        for dx, dy in ((-1,0), (1,0), (0,-1), (0,1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and not visited[ny, nx]:
                q.append((nx, ny))

# 2. Transparent Version initial setup
trans_arr = arr.copy()
trans_arr[is_bg, 3] = 0

# 3. Complete removal of levitation ring and ground shadow:
# Keel ends at Y=746, hands end at Y=737.
# Zero out everything at Y >= 747 and ring tips outside body at Y=745..746
trans_arr[747:, :, 3] = 0
trans_arr[745:747, :388, 3] = 0
trans_arr[745:747, 636:, 3] = 0

# 4. Multi-pass Edge Defringing (De-halo):
# Iteratively detect and eliminate light/white halo boundary pixels bordering transparency
for p in range(1, 5):
    t_mask = (trans_arr[:, :, 3] == 0)
    o_mask = (trans_arr[:, :, 3] > 0)
    
    neighbor_trans = np.zeros((H, W), dtype=bool)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            ys = slice(max(0, -dy), min(H, H - dy))
            xs = slice(max(0, -dx), min(W, W - dx))
            yd = slice(max(0, dy), min(H, H + dy))
            xd = slice(max(0, dx), min(W, W + dx))
            neighbor_trans[yd, xd] |= t_mask[ys, xs]
            
    boundary = o_mask & neighbor_trans
    r = trans_arr[:, :, 0]
    g = trans_arr[:, :, 1]
    b = trans_arr[:, :, 2]
    
    # Identify halo pixels: near-white or desaturated light boundary pixels
    is_halo = boundary & (
        ((r >= 180) & (g >= 180) & (b >= 180)) |
        ((r >= 145) & (g >= 145) & (b >= 155) & (np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b) < 40))
    )
    
    cnt = np.sum(is_halo)
    if cnt == 0:
        break
    trans_arr[is_halo, 3] = 0

# 5. Precise cleaning of the 2 rogue white artifact pixels:
# 5a. Directly under the inner finger/thumb of left hand (below horizontal finger contour):
trans_arr[716:727, 256:266] = [0, 0, 0, 0]

# 5b. On the very top-left corner tip of the antenna:
trans_arr[101:103, 265:277] = [0, 0, 0, 0]
trans_arr[103:113, 276:278] = [0, 0, 0, 0]
trans_arr[121:123, 265:268] = [0, 0, 0, 0]

# 6. Procedural Pixel-Perfect Rounded Hover-Base Reconstruction
# Exact sprite palette definitions:
C_OUTLINE = [0, 4, 39, 255]          # Deep dark navy-black outline (#000427)
C_CHASSIS_BLUE = [36, 88, 180, 255]   # Cobalt Blue (#2458B4)
C_CHASSIS_SHADOW = [22, 55, 120, 255] # Deep Chassis Blue Shadow (#163778)
C_BELLY_SHADE = [170, 185, 218, 255]  # Shaded Belly Off-white (#AAB9DA)
C_BELLY_WHITE = [238, 242, 251, 255]  # Pure Belly White (#EEF2FB)
C_EMITTER_CORE = [0, 240, 255, 255]   # Glowing Cyan Emitter (#00F0FF)
C_EMITTER_RIM = [14, 25, 60, 255]     # Dark Metallic Emitter Rim (#0E193C)

# Row 0: Y in [737, 746] - Restore smooth belly & blue panels above cutoff:
trans_arr[737:747, 389:409] = C_OUTLINE
trans_arr[737:747, 409:454] = C_CHASSIS_BLUE
trans_arr[737:747, 454:464] = C_OUTLINE
trans_arr[737:747, 464:560] = C_BELLY_SHADE
trans_arr[737:742, 490:534] = C_BELLY_WHITE
trans_arr[737:747, 560:570] = C_OUTLINE
trans_arr[737:747, 570:615] = C_CHASSIS_BLUE
trans_arr[737:747, 615:635] = C_OUTLINE

# Row 1: Y in [747, 756] (height 10, logical step 1) - Taper width to 226px:
trans_arr[747:757, 399:409] = C_OUTLINE
trans_arr[747:757, 409:454] = C_CHASSIS_BLUE
trans_arr[747:757, 454:464] = C_OUTLINE
trans_arr[747:757, 464:560] = C_BELLY_SHADE
trans_arr[747:757, 560:570] = C_OUTLINE
trans_arr[747:757, 570:615] = C_CHASSIS_BLUE
trans_arr[747:757, 615:625] = C_OUTLINE

# Row 2: Y in [757, 766] (height 10, logical step 2) - Taper width to 196px & close belly arc:
trans_arr[757:767, 414:424] = C_OUTLINE
trans_arr[757:767, 424:464] = C_CHASSIS_BLUE
trans_arr[757:767, 464:474] = C_OUTLINE
trans_arr[757:764, 474:550] = C_BELLY_SHADE
trans_arr[764:767, 464:560] = C_OUTLINE # Neat capping arc under white belly
trans_arr[757:767, 550:560] = C_OUTLINE
trans_arr[757:767, 560:600] = C_CHASSIS_BLUE
trans_arr[757:767, 600:610] = C_OUTLINE

# Row 3: Y in [767, 776] (height 10, logical step 3) - U-shaped chassis base & deep shadow keel:
trans_arr[767:777, 434:444] = C_OUTLINE
trans_arr[767:777, 444:474] = C_CHASSIS_BLUE
trans_arr[767:777, 474:550] = C_CHASSIS_SHADOW
trans_arr[767:777, 550:580] = C_CHASSIS_BLUE
trans_arr[767:777, 580:590] = C_OUTLINE

# Row 4: Y in [777, 786] (height 10, logical step 4) - Lower rounded keel hull:
trans_arr[777:787, 459:469] = C_OUTLINE
trans_arr[777:784, 469:555] = C_CHASSIS_SHADOW
trans_arr[784:787, 459:565] = C_OUTLINE # Bottom hull outline
trans_arr[777:787, 555:565] = C_OUTLINE

# Row 5: Y in [787, 792] (height 6, logical step 5) - Compact Central Antigravity Emitter Pod:
trans_arr[787:793, 484:494] = C_OUTLINE
trans_arr[787:789, 494:530] = C_EMITTER_CORE # Bright cyan levitation core
trans_arr[789:791, 494:530] = C_EMITTER_RIM  # Dark metallic housing
trans_arr[791:793, 484:540] = C_OUTLINE      # Bottom emitter outline
trans_arr[787:793, 530:540] = C_OUTLINE

# 7. Enforce strictly (0, 0, 0, 0) for all transparent pixels to eliminate premultiplied alpha glow
trans_arr[trans_arr[:, :, 3] == 0] = [0, 0, 0, 0]
trans_img = Image.fromarray(trans_arr, 'RGBA')

# 8. Decompose into 4 skeletal rigging parts via Connected Components:
# Left Hand, Right Hand, Head (with antenna & ears), Torso (with collar extension & hover base)
alpha_mask = trans_arr[:, :, 3] > 0
visited = np.zeros((H, W), dtype=bool)
comps = []

for y in range(H):
    for x in range(W):
        if alpha_mask[y, x] and not visited[y, x]:
            coords = []
            cq = deque([(x, y)])
            visited[y, x] = True
            while cq:
                cx, cy = cq.popleft()
                coords.append((cx, cy))
                for dx, dy in ((-1,0), (1,0), (0,-1), (0,1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < W and 0 <= ny < H and alpha_mask[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        cq.append((nx, ny))
            comps.append(coords)

lh_arr = np.zeros_like(trans_arr)
rh_arr = np.zeros_like(trans_arr)
head_arr = np.zeros_like(trans_arr)
torso_arr = np.zeros_like(trans_arr)

for c in comps:
    xs = [pt[0] for pt in c]
    ys = [pt[1] for pt in c]
    min_x, max_x = min(xs), max(xs)
    if min_x < 400 and max_x < 400 and min(ys) > 500:
        for x, y in c: lh_arr[y, x] = trans_arr[y, x]
    elif min_x > 600 and min(ys) > 500:
        for x, y in c: rh_arr[y, x] = trans_arr[y, x]
    else:
        for x, y in c:
            if y <= 480:
                head_arr[y, x] = trans_arr[y, x]
            else:
                torso_arr[y, x] = trans_arr[y, x]

# Extend dark neck collar on torso layer (Y=455..480) to eliminate transparent gap during head tilt/lift:
torso_arr[465:481, 340:685] = C_OUTLINE
torso_arr[455:465, 360:665] = C_OUTLINE

lh_img = Image.fromarray(lh_arr, 'RGBA')
rh_img = Image.fromarray(rh_arr, 'RGBA')
head_img = Image.fromarray(head_arr, 'RGBA')
torso_img = Image.fromarray(torso_arr, 'RGBA')

# 9. Solid Flat Pure White Version (#FFFFFF)
white_arr = trans_arr.copy()
white_arr[trans_arr[:, :, 3] == 0] = [255, 255, 255, 255]
white_img = Image.fromarray(white_arr, 'RGBA').convert('RGB')

# 10. Generate pixel-perfect cropped assets for the desktop overlay renderer:
# Precise bounding box crop preserving integer proportions & exact screen alignment
def crop_to_256(source_img):
    c1024 = source_img.crop((143, 102, 881, 973))
    c256 = c1024.resize((201, 237), Image.NEAREST)
    c_canvas = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    c_canvas.paste(c256, (28, 10))
    return c_canvas

def crop_to_128(source_img):
    c1024 = source_img.crop((143, 102, 881, 973))
    c128 = c1024.resize((100, 118), Image.NEAREST)
    c_canvas = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
    c_canvas.paste(c128, (14, 5))
    return c_canvas

def crop_to_512(source_img):
    c1024 = source_img.crop((143, 102, 881, 973))
    c512 = c1024.resize((402, 474), Image.NEAREST)
    c_canvas = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    c_canvas.paste(c512, (56, 20))
    return c_canvas

canvas256 = crop_to_256(trans_img)
canvas128 = crop_to_128(trans_img)
canvas512 = crop_to_512(trans_img)

# 4 Skeletal Part Canvases (256x256)
head256 = crop_to_256(head_img)
torso256 = crop_to_256(torso_img)
lh256 = crop_to_256(lh_img)
rh256 = crop_to_256(rh_img)

# Export primary 1024x1024 master assets
white_img.save(os.path.join(out_clean_dir, 'gravi_clean_white_1024.png'), 'PNG')
trans_img.save(os.path.join(out_clean_dir, 'gravi_clean_transparent_1024.png'), 'PNG')
white_img.save('d:/Projects/AG_Pet/gravi_clean_game_asset.png', 'PNG')
trans_img.save('d:/Projects/AG_Pet/gravi_clean_game_asset_transparent.png', 'PNG')
white_img.save(os.path.join(artifact_dir, 'gravi_clean_game_asset.png'), 'PNG')
trans_img.save(os.path.join(artifact_dir, 'gravi_clean_game_asset_transparent.png'), 'PNG')

# Export cropped renderer master assets
for dest_dir in [out_clean_dir, renderer_assets_dir, dist_assets_dir]:
    canvas256.save(os.path.join(dest_dir, 'gravi_cropped_256.png'), 'PNG')
    canvas128.save(os.path.join(dest_dir, 'gravi_cropped_128.png'), 'PNG')
    canvas512.save(os.path.join(dest_dir, 'gravi_cropped_512.png'), 'PNG')
    
    # 4 Skeletal Part Assets
    head256.save(os.path.join(dest_dir, 'gravi_head_256.png'), 'PNG')
    torso256.save(os.path.join(dest_dir, 'gravi_torso_256.png'), 'PNG')
    lh256.save(os.path.join(dest_dir, 'gravi_left_hand_256.png'), 'PNG')
    rh256.save(os.path.join(dest_dir, 'gravi_right_hand_256.png'), 'PNG')

for name, img_part in [('gravi_head_256.png', head256), ('gravi_torso_256.png', torso256), ('gravi_left_hand_256.png', lh256), ('gravi_right_hand_256.png', rh256)]:
    img_part.save(os.path.join(artifact_dir, name), 'PNG')

print('All 4 skeletal rigging parts cleanly generated and exported with neck collar and zero transparent gap!')
