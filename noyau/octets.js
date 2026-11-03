// Octets, base64url et aléatoire : mêmes fonctions dans Node (PC) et dans le navigateur (mobile).

export function aleatoire(n) {
  const octets = new Uint8Array(n);
  globalThis.crypto.getRandomValues(octets);
  return octets;
}

export function versBase64url(octets) {
  let binaire = '';
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function depuisBase64url(texte) {
  if (typeof texte !== 'string' || !/^[A-Za-z0-9_-]*$/.test(texte)) throw new Error('Données illisibles.');
  const binaire = atob(texte.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((texte.length + 3) % 4));
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i += 1) octets[i] = binaire.charCodeAt(i);
  return octets;
}

export function identifiant(longueur = 9) {
  return versBase64url(aleatoire(longueur));
}

export const texteVersOctets = (texte) => new TextEncoder().encode(texte);
export const octetsVersTexte = (octets) => new TextDecoder().decode(octets);
