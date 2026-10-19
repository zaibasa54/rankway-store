// Public shape of a product: hides the private PDF reference, exposes a cover URL.
export const pub = ({ pdfFileId, previewFileId, coverFileId, ...p }) => ({ ...p, hasSample: !!previewFileId, coverImage: coverFileId ? `/api/files/cover/${coverFileId}` : null });
export const pubPost = ({ coverFileId, ...p }) => ({ ...p, coverImage: coverFileId ? `/api/files/cover/${coverFileId}` : null });
