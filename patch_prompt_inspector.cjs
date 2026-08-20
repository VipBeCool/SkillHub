const fs = require('fs');
let content = fs.readFileSync('src/PromptModule.tsx', 'utf8');

content = content.replace(
  /import \{ Plus, Download, Star, LayoutGrid, Trash2, Trash, FolderPlus, MoreHorizontal \} from "lucide-react";/,
  'import { Plus, Download, Star, LayoutGrid, Trash2, Trash, FolderPlus, MoreHorizontal, X, Languages, Loader2 } from "lucide-react";\nimport { useRef } from "react";'
);

// We had removed useRef earlier! Let's check if useRef is imported.
