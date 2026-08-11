from PIL import Image

img = Image.open("src-tauri/icons/tray_icon.png")
bbox = img.getbbox()
print(f"Original size: {img.size}")
print(f"Bbox: {bbox}")

if bbox:
    # crop it
    cropped = img.crop(bbox)
    print(f"Cropped size: {cropped.size}")
    
    # We want it to be a perfect square, so find the max dimension and pad the other side slightly 
    # to maintain aspect ratio, but keep the padding to an absolute minimum (just to make it square).
    max_dim = max(cropped.width, cropped.height)
    square_img = Image.new("RGBA", (max_dim, max_dim), (0, 0, 0, 0))
    x_offset = (max_dim - cropped.width) // 2
    y_offset = (max_dim - cropped.height) // 2
    square_img.paste(cropped, (x_offset, y_offset))
    
    square_img.save("src-tauri/icons/tray_icon.png")
    print("Saved cropped tray_icon.png")

