from PIL import Image

def process():
    # Load the original app icon
    try:
        img = Image.open("src-tauri/icons/icon.png").convert("RGBA")
    except Exception as e:
        print("Error loading icon:", e)
        return
        
    width, height = img.size
    new_img = Image.new("RGBA", (width, height))
    
    # Process pixels
    pixels = img.load()
    new_pixels = new_img.load()
    
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            
            # If the original pixel is transparent (e.g. rounded corners), keep it transparent
            if a < 10:
                new_pixels[x, y] = (0, 0, 0, 0)
                continue
                
            # Calculate brightness
            # The 'SH' is white/light, the background is blue.
            # Blue in RGB: R is low, G is med, B is high.
            # White: R, G, B are all high.
            # A simple way to isolate white: check if R and G are high.
            brightness = (r + g + b) / 3
            
            # The logo has a shadow/emboss, so it's not pure white everywhere,
            # but the blue background has low R and G.
            # Let's check R value. For blue, R is usually < 100. For white/light, R is > 150.
            if r > 150 and g > 150:
                # This is part of the 'SH' logo -> make it transparent!
                new_pixels[x, y] = (0, 0, 0, 0)
            else:
                # This is part of the background -> make it opaque!
                new_pixels[x, y] = (0, 0, 0, 255)

    # Note: Because the original icon might have soft anti-aliasing edges between white and blue,
    # a hard threshold might look jagged. 
    # Let's try to map the R channel directly to transparency to get smooth edges.
    
    # Better approach for smooth anti-aliasing:
    # Use the blue background as opaque, white logo as transparent.
    # We can use the 'R' channel to determine transparency.
    # Dark (R=0) -> Alpha=255
    # Light (R=255) -> Alpha=0
    # Let's do this smoothly:
    smooth_img = Image.new("RGBA", (width, height))
    smooth_pixels = smooth_img.load()
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                smooth_pixels[x, y] = (0, 0, 0, 0)
            else:
                # Map r to alpha: r=0 -> alpha=255, r=255 -> alpha=0
                # The blue background has R around 0-50.
                # The white logo has R around 200-255.
                # Let's clamp and scale:
                if r < 80:
                    new_a = 255
                elif r > 180:
                    new_a = 0
                else:
                    # linearly interpolate between 80 and 180
                    # new_a goes from 255 down to 0
                    ratio = (r - 80) / 100.0
                    new_a = int(255 * (1.0 - ratio))
                
                # Combine with original alpha (for the rounded corners)
                final_a = int((new_a / 255.0) * (a / 255.0) * 255)
                smooth_pixels[x, y] = (0, 0, 0, final_a)
                
    # macOS system tray icon should not have ANY empty padding around the shape if we want it to be full size.
    # The original icon.png probably doesn't have empty padding, it fills the canvas.
    smooth_img.save("src-tauri/icons/tray_icon.png")
    print("Generated tray_icon.png")

process()
