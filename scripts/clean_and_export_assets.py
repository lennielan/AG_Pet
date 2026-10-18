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
body_arr = np.zeros_like(trans_arr)

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
            body_arr[y, x] = trans_arr[y, x]

# Recolor base eyes in visor on body_arr to match dark screen background (#1D2144):
C_VISOR_BG = [29, 33, 68, 255] # #1D2144
visor_slice = body_arr[320:400, 380:645]
is_eye = (visor_slice[:, :, 1] > 90) | (visor_slice[:, :, 0] > 60) | (visor_slice[:, :, 2] > 140)
visor_slice[is_eye] = C_VISOR_BG

lh_img = Image.fromarray(lh_arr, 'RGBA')
rh_img = Image.fromarray(rh_arr, 'RGBA')
body_img = Image.fromarray(body_arr, 'RGBA')

# Seamless unified body: head_img is full body, torso_img is clean transparent canvas for backwards compatibility
head_img = body_img
torso_img = Image.new('RGBA', (W, H), (0, 0, 0, 0))

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

# Generate 3 Alternate Hand Sprites (256x256)
# 1. Right hand think (fingers pointing up to chin at X=152, Y=116)
rh_box = rh256.getbbox()
rh_crop = rh256.crop(rh_box)
rh_flip = rh_crop.transpose(Image.FLIP_TOP_BOTTOM)

rh_think_256 = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
tx = 152 - rh_flip.width // 2
ty = 116 - rh_flip.height // 2
rh_think_256.paste(rh_flip, (tx, ty), rh_flip)

# 2. Right hand up (fingers up at shoulder/earphone X=194, Y=108)
rh_up_256 = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
rx = 194 - rh_flip.width // 2
ry = 108 - rh_flip.height // 2
rh_up_256.paste(rh_flip, (rx, ry), rh_flip)

# 3. Left hand up (fingers up at shoulder/earphone X=62, Y=108)
lh_box = lh256.getbbox()
lh_crop = lh256.crop(lh_box)
lh_flip = lh_crop.transpose(Image.FLIP_TOP_BOTTOM)

lh_up_256 = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
lx = 62 - lh_flip.width // 2
ly = 108 - lh_flip.height // 2
lh_up_256.paste(lh_flip, (lx, ly), lh_flip)

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
    
    # Skeletal Part Assets
    head256.save(os.path.join(dest_dir, 'gravi_body_256.png'), 'PNG')
    head256.save(os.path.join(dest_dir, 'gravi_head_256.png'), 'PNG')
    torso256.save(os.path.join(dest_dir, 'gravi_torso_256.png'), 'PNG')
    lh256.save(os.path.join(dest_dir, 'gravi_left_hand_256.png'), 'PNG')
    rh256.save(os.path.join(dest_dir, 'gravi_right_hand_256.png'), 'PNG')
    rh_think_256.save(os.path.join(dest_dir, 'gravi_right_hand_think_256.png'), 'PNG')
    rh_up_256.save(os.path.join(dest_dir, 'gravi_right_hand_up_256.png'), 'PNG')
    lh_up_256.save(os.path.join(dest_dir, 'gravi_left_hand_up_256.png'), 'PNG')

for name, img_part in [
    ('gravi_body_256.png', head256),
    ('gravi_head_256.png', head256),
    ('gravi_torso_256.png', torso256),
    ('gravi_left_hand_256.png', lh256),
    ('gravi_right_hand_256.png', rh256),
    ('gravi_right_hand_think_256.png', rh_think_256),
    ('gravi_right_hand_up_256.png', rh_up_256),
    ('gravi_left_hand_up_256.png', lh_up_256),
]:
    img_part.save(os.path.join(artifact_dir, name), 'PNG')

def generate_running_assets(body_64_rgba, out_dirs):
    """
    Генерирует идеальные попиксельные ассеты для состояния running (256x256):
    1. gravi_body_running_256.png — корпус, где нижняя часть звезды аккуратно скрыта под белую броню груди (только верхний золотой кончик виден над рукой, никаких прямоугольников в renderer.ts!).
    2. gravi_laptop_256.png — изометрический ноутбук с мягким свечением экрана без черных куполов.
    3. gravi_left_hand_typing_1_256.png и gravi_left_hand_typing_2_256.png — 2 кадра артикуляции левой руки (предплечье неподвижно у плеча, двигаются только кисть и пальцы!).
    4. gravi_right_hand_typing_1_256.png и gravi_right_hand_typing_2_256.png — 2 кадра артикуляции правой руки за ноутбуком + динамические штрихи движения.
    """
    from PIL import Image
    import os

    PAL = {
        '.': (0, 0, 0, 0),
        'O': (8, 11, 26, 255),       # Темный контур
        'W': (244, 248, 255, 255),   # Белый блик брони/манжеты
        'S': (188, 210, 246, 255),   # Голубоватая тень белой брони
        'L': (78, 142, 247, 255),    # Светло-синий блик руки
        'B': (45, 104, 224, 255),    # Основной синий цвет руки
        'D': (24, 58, 154, 255),     # Темно-синяя тень руки
        'C': (44, 232, 245, 255),    # Яркий неоновый голубой (кончик пальца / клавиши / лого)
        'H': (165, 250, 255, 255),   # Белый-голубой центр свечения
        'T': (20, 168, 198, 255),    # Бирюзовый цвет клавиш и пальцев в свете экрана
        'M': (156, 168, 188, 220),   # Серые штрихи быстрого движения руки
        'G': (135, 142, 160, 255),   # Основной серый металл крышки ноутбука
        'E': (182, 189, 206, 255),   # Светлая верхняя грань крышки ноутбука
        'K': (92, 98, 116, 255),     # Темно-серая тень корпуса ноутбука
        'N': (28, 38, 60, 255),      # Темная ниша клавиатуры
        '1': (44, 232, 245, 55),     # Мягкое полупрозрачное свечение экрана (внешнее)
        '2': (44, 232, 245, 90),     # Мягкое полупрозрачное свечение экрана (внутреннее)
    }

    def draw_ascii_map(canvas_64, x0, y0, rows):
        px = canvas_64.load()
        for dy, row in enumerate(rows):
            y = y0 + dy
            if not (0 <= y < 64):
                continue
            for dx, ch in enumerate(row):
                x = x0 + dx
                if not (0 <= x < 64) or ch == '.':
                    continue
                color = PAL.get(ch)
                if color:
                    px[x, y] = color

    # 1. Корпус для running: аккуратно убираем нижнюю часть звезды внутри самой текстуры груди,
    # оставляя только верхний золотой лучик (Y <= 36) и добавляя 2 маленьких штриха на груди справа
    body_run = body_64_rgba.copy()
    bpx = body_run.load()
    for y in range(37, 45):
        for x in range(27, 37):
            # Заменяем пиксели нижней части звезды на естественный цвет белой грудной пластины
            if y < 42:
                bpx[x, y] = (244, 248, 255, 255)
            else:
                bpx[x, y] = (188, 210, 246, 255)
    # Закрываем контур под верхним золотым лучиком звезды на Y=37
    bpx[31, 37] = (8, 11, 26, 255)
    bpx[32, 37] = (8, 11, 26, 255)
    bpx[33, 37] = (8, 11, 26, 255)
    # Два маленьких темных штриха детализации на правой стороне груди (как на референсе)
    bpx[36, 37] = (24, 42, 84, 255)
    bpx[38, 37] = (24, 42, 84, 255)
    bpx[38, 38] = (24, 42, 84, 255)

    # 2. ЛЕВАЯ РУКА (Кадр 1 — палец нажимает клавишу, Кадр 2 — кисть приподнята на 1px)
    # Координаты вставки: x0 = 20, y0 = 36 (размер 18x9)
    # Предплечье слева (столбцы 0..9) остается НЕПОДВИЖНЫМ, двигается только кисть и 2 диагональных пальца!
    LEFT_HAND_F1 = [
        "....OOOOOO........", # Y=36: верхний контур наплечника/предплечья
        "..OOLLLLLLOO......", # Y=37: светло-синий блик предплечья
        ".OLLBBBBBBBBOO....", # Y=38: округлое синее предплечье
        ".OBBBBBBBBOOOBOO..", # Y=39: переход в кисть + верхний палец
        ".ODBBBBDOOWWOOBBO.", # Y=40: низ предплечья + белая манжета + пальцы под углом
        "..OOOOOOWWWSSOOBCO", # Y=41: белая манжета с тенью + голубой светящийся кончик пальца!
        ".......OOOOOOOBBOO", # Y=42: нижний контур манжеты и средний палец
        "............OOOOO.", # Y=43: контур кончиков пальцев
        "..................", # Y=44
    ]

    LEFT_HAND_F2 = [
        "....OOOOOO........", # Y=36: предплечье стоит на месте!
        "..OOLLLLLLOO......", # Y=37: предплечье стоит на месте!
        ".OLLBBBBBBBBOOO...", # Y=38: кисть и пальцы приподнялись на 1 пиксель вверх
        ".OBBBBBBBBOOWWBOO.", # Y=39: белая манжета + пальцы чуть выше
        ".ODBBBBDOOWWWSSBCO", # Y=40: пальцы приподняты над клавишей
        "..OOOOOOO.OOOOOBBO", # Y=41: контур под приподнятой кистью
        ".............OOOO.", # Y=42: контур пальцев
        "..................", # Y=43
        "..................", # Y=44
    ]

    # 3. ПРАВАЯ РУКА ЗА НОУТБУКОМ (Кадр 1 — приподнята, Кадр 2 — нажатие + штрихи движения)
    # Координаты вставки: x0 = 40, y0 = 31 (размер 13x9)
    RIGHT_HAND_F1 = [
        ".............", # Y=31
        "..OOOOO......", # Y=32: кисть приподнята на 1px
        ".OWWWWWOO....", # Y=33: белая верхняя крышка кисти
        ".OWWWWSSSO...", # Y=34: белая крышка с голубоватой тенью
        ".OOTTTBBOO...", # Y=35: два сине-бирюзовых пальца
        "..OTCTOBBO...", # Y=36: кончики пальцев
        "...OOO.OOO...", # Y=37: нижний контур пальцев
        ".............", # Y=38
    ]

    RIGHT_HAND_F2 = [
        "........M....", # Y=31: верхний штрих движения
        ".......M..M..", # Y=32: штрихи движения над правой рукой (как на референсе!)
        "..OOOOO...M..", # Y=33: контур кисти (опустилась на 1px в нажатие)
        ".OWWWWWOO....", # Y=34: белая верхняя крышка кисти
        ".OWWWWSSSO...", # Y=35: белая крышка с тенью
        ".OOTTTBBOO...", # Y=36: пальцы нажимают клавиши
        "..OTCHOBCO...", # Y=37: кончики пальцев ярко вспыхивают от нажатия!
        "...OOO.OOO...", # Y=38: нижний контур пальцев
    ]

    # 4. ИЗОМЕТРИЧЕСКИЙ НОУТБУК С МЯГКИМ СВЕЧЕНИЕМ ЭКРАНА (БЕЗ черного купола!)
    # Координаты вставки: x0 = 28, y0 = 36 (размер 30x14)
    LAPTOP_MAP = [
        "...........1111111..........", # Y=36: легкое свечение от экрана (без контура!)
        "..........112222211.......OOO.", # Y=37: свечение + правый верхний уголок крышки
        ".........122222221....OOOOEEO.", # Y=38: ступенчатая верхняя грань крышки (E - светлая фаска)
        "........12222221..OOOOEEEEGGO.", # Y=39: верхняя грань крышки ноутбука
        "......OOOONNNNOOOOEEEEGGGGGGO.", # Y=40: стык клавиатуры и крышки ноутбука
        "....OONNTCNTCTNNOGGGGGGGGGGGO.", # Y=41: клавиши (T,C) + серая крышка (G)
        "..OONNTCTNTCTNNOOGGGGGCCCGGGO.", # Y=42: клавиши + голубой логотип (C) в центре крышки!
        ".ONNTCNTCTNTNNOOGGGGCCCCGGGO..", # Y=43: клавиши + яркий центр логотипа на крышке
        ".OKKNNTCTNTNNOOGGGGCCCGGGGKO..", # Y=44: бортик базы (K) + крышка
        "..OOKKNNTCTNOOGGGGGGGGGGGKO...", # Y=45: левый край базы опускается к петле
        "....OOKKNNNOOGGGGGGGGGKOOO....", # Y=46: низ клавиатуры + правый нижний угол крышки
        "......OOKKOOGGGGGGGKOOO.......", # Y=47: петля ноутбука
        "........OOOKKKKKOOOO..........", # Y=48: нижний угол петли ноутбука
        "..........OOOOOO..............", # Y=49: замыкающий контур
    ]

    def export_64_to_256(img64, filename):
        img256 = img64.resize((256, 256), Image.NEAREST)
        for d in out_dirs:
            os.makedirs(d, exist_ok=True)
            img256.save(os.path.join(d, filename))

    # Экспорт корпуса для running
    export_64_to_256(body_run, "gravi_body_running_256.png")

    # Экспорт ноутбука
    laptop_64 = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw_ascii_map(laptop_64, 28, 36, LAPTOP_MAP)
    export_64_to_256(laptop_64, "gravi_laptop_256.png")

    # Экспорт 2 кадров левой руки (и базового файла для совместимости)
    lh1_64 = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw_ascii_map(lh1_64, 20, 36, LEFT_HAND_F1)
    export_64_to_256(lh1_64, "gravi_left_hand_typing_1_256.png")
    export_64_to_256(lh1_64, "gravi_left_hand_typing_256.png")

    lh2_64 = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw_ascii_map(lh2_64, 20, 36, LEFT_HAND_F2)
    export_64_to_256(lh2_64, "gravi_left_hand_typing_2_256.png")

    # Экспорт 2 кадров правой руки (и базового файла для совместимости)
    rh1_64 = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw_ascii_map(rh1_64, 40, 31, RIGHT_HAND_F1)
    export_64_to_256(rh1_64, "gravi_right_hand_typing_1_256.png")
    export_64_to_256(rh1_64, "gravi_right_hand_typing_256.png")

    rh2_64 = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw_ascii_map(rh2_64, 40, 31, RIGHT_HAND_F2)
    export_64_to_256(rh2_64, "gravi_right_hand_typing_2_256.png")

    # Экспорт 2 цельных попиксельно сшитых кадров всего состояния running (Gravi Coder)
    ref_user_path = 'C:/Users/lennielan/.gemini/antigravity/brain/829b2a0e-fac4-4746-92f2-d9d0d1042177/.user_uploaded/media_1792158066036_f9241482.png'
    if os.path.exists(ref_user_path):
        ref_img = Image.open(ref_user_path).convert('RGB')
        crop = ref_img.crop((40, 140, 220, 350))
        c_arr = np.array(crop)
        out64 = Image.new('RGB', (64, 64), (17, 17, 17))
        opx = out64.load()
        sx, sy, ox, oy = 4.0, 4.0, -49, 3
        for y in range(64):
            for x in range(64):
                cx = int(round(ox + (x + 0.5) * sx))
                cy = int(round(oy + (y + 0.5) * sy))
                if 0 <= cx < c_arr.shape[1] and 0 <= cy < c_arr.shape[0]:
                    opx[x, y] = tuple(c_arr[cy, cx])
        a64 = np.array(out64)
        H_c, W_c, _ = a64.shape
        is_bg_ref = np.zeros((H_c, W_c), dtype=bool)
        q_ref = deque()
        for x in range(W_c):
            q_ref.append((x, 0))
            q_ref.append((x, H_c - 1))
        for y in range(H_c):
            q_ref.append((0, y))
            q_ref.append((W_c - 1, y))
        visited_ref = np.zeros((H_c, W_c), dtype=bool)
        while q_ref:
            x, y = q_ref.popleft()
            if visited_ref[y, x]:
                continue
            visited_ref[y, x] = True
            r_c, g_c, b_c = a64[y, x]
            if r_c < 30 and g_c < 30 and b_c < 30:
                is_bg_ref[y, x] = True
                for dx, dy in ((-1,0), (1,0), (0,-1), (0,1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W_c and 0 <= ny < H_c and not visited_ref[ny, nx]:
                        q_ref.append((nx, ny))
        ref_rgba = np.zeros((H_c, W_c, 4), dtype=np.uint8)
        ref_rgba[:, :, :3] = a64
        ref_rgba[:, :, 3] = 255
        ref_rgba[is_bg_ref, 3] = 0

        b_clean_arr = np.array(body_64_rgba)
        f2_arr = ref_rgba.copy()
        f2_arr[:30, :, :] = b_clean_arr[:30, :, :]
        f2_arr[16:27, 21:43] = [29, 33, 68, 255]
        f2_arr[1, 14] = [0, 0, 0, 0]
        f2_arr[39, 42] = [140, 250, 255, 255]

        f1_arr = f2_arr.copy()
        f1_arr[30, 48] = [0, 0, 0, 0]
        f1_arr[31, 49] = [0, 0, 0, 0]
        for x in range(43, 49):
            for y in range(31, 35):
                f1_arr[y, x] = f2_arr[y + 1, x]
            f1_arr[35, x] = f2_arr[36, x] if f2_arr[36, x, 3] > 0 else [0, 0, 0, 0]
        f1_arr[42, 32] = [140, 250, 255, 255]

        export_64_to_256(Image.fromarray(f1_arr, 'RGBA'), "gravi_running_frame1_256.png")
        export_64_to_256(Image.fromarray(f2_arr, 'RGBA'), "gravi_running_frame2_256.png")

body_64_rgba = head256.resize((64, 64), Image.NEAREST)
generate_running_assets(body_64_rgba, [out_clean_dir, renderer_assets_dir, dist_assets_dir, artifact_dir])

print('All skeletal rigging parts including alternate hands and unified running frames cleanly generated and exported!')
