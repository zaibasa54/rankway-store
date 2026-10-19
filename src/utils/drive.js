// Google Drive share links -> direct download links. Other http(s) links are returned unchanged.
export const driveDirect = (u) => {
  const m = String(u).match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=download&)?id=)([\w-]{10,})/);
  return m ? `https://drive.google.com/uc?export=download&id=${m[1]}` : u;
};
