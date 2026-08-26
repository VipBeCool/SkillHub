import re

with open("src-tauri/src/commands.rs", "r") as f:
    content = f.read()

# Replace set_macos_folder_icon and remove_macos_folder_icon calls
content = re.sub(r'#\[cfg\(target_os = "macos"\)\]\s+set_macos_folder_icon\((.*?)\);', r'set_folder_icon(\1);', content)
content = re.sub(r'set_macos_folder_icon\((.*?)\);', r'set_folder_icon(\1);', content)
content = re.sub(r'remove_macos_folder_icon\((.*?)\);', r'remove_folder_icon(\1);', content)

with open("src-tauri/src/commands.rs", "w") as f:
    f.write(content)
