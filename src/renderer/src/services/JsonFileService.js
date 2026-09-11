export function createJsonFileService({ invoke } = {}) {
  async function save(jsonFileInfo, { backupOriginal = false } = {}) {
    try {
      const response = await invoke('save-json-file', { ...jsonFileInfo, backupOriginal });
      if (!response.success) {
        const error = response.error || 'Unknown error';
        console.error('Failed to save JSON file:', error);
        return { success: false, error };
      }
      return { success: true, backupPath: response.backupPath || '' };
    } catch (error) {
      console.error('An error occurred while saving JSON file:', error);
      return { success: false, error: error.message };
    }
  }

  return { save };
}
