import sys
from PIL import Image, ImageDraw, ImageFont

size = (512, 512)
mask = Image.new("L", size, 0)
mask_draw = ImageDraw.Draw(mask)

border = 48
xy = [border, border, size[0]-border, size[1]-border]
rad = 100
mask_draw.rounded_rectangle(xy, radius=rad, fill=255)

try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 260)
except Exception:
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 260)
    except Exception:
        font = ImageFont.load_default()

text = "SH"
bbox = mask_draw.textbbox((0, 0), text, font=font)
w = bbox[2] - bbox[0]
h = bbox[3] - bbox[1]
x = (size[0] - w) / 2
y = (size[1] - h) / 2 - 60

mask_draw.text((x, y), text, fill=0, font=font)

final_img = Image.new("RGBA", size, (0, 0, 0, 0))
final_img.paste((255, 255, 255, 255), (0, 0), mask)

final_img.save("src-tauri/icons/tray_icon.png")
