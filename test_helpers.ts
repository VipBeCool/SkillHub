// Just to think about the logic
const isValidIcon = (config) => {
  if (config.type === 'emoji') {
    return EMOJI_DATA.some(g => g.emojis.some(e => e.char === config.value));
  }
  return ICON_DATA.some(g => g.icons.some(i => i.id === config.value));
}
