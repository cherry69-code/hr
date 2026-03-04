exports.render = (htmlContent, data) => {
  if (!htmlContent) return '';
  const safeData = data || {};
  return htmlContent.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = safeData[key];
    return value === undefined || value === null ? '' : String(value);
  });
};

