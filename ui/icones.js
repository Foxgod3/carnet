// Icônes dessinées en SVG (trait de 1,8 px sur une grille de 24), créées par le DOM : rien à charger,
// compatible avec la politique de sécurité de la page.

const NS = 'http://www.w3.org/2000/svg';

const DESSINS = {
  plus: [['path', { d: 'M12 5v14M5 12h14' }]],
  fermer: [['path', { d: 'M6 6l12 12M18 6 6 18' }]],
  coche: [['path', { d: 'M5 12.5 9.5 17 19 7' }]],
  actualiser: [['path', { d: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5' }]],
  cadenas: [
    ['rect', { x: 5, y: 11, width: 14, height: 9, rx: 2.2 }],
    ['path', { d: 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3' }],
  ],
  reglages: [
    ['path', { d: 'M4 7h9M17 7h3M4 17h3M11 17h9' }],
    ['circle', { cx: 15, cy: 7, r: 2 }],
    ['circle', { cx: 9, cy: 17, r: 2 }],
  ],
  telephone: [
    ['rect', { x: 7, y: 3, width: 10, height: 18, rx: 2.5 }],
    ['path', { d: 'M11 17.5h2' }],
  ],
  corbeille: [['path', { d: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l.9 12.2a1 1 0 0 0 1 .8h7.2a1 1 0 0 0 1-.8L17.5 7' }]],
  importer: [['path', { d: 'M12 4v10M7.5 9.5 12 14l4.5-4.5M5 19h14' }]],
  crayon: [['path', { d: 'M14.5 5.5l4 4M4.5 19.5l1-4.5L15 5.5a1.4 1.4 0 0 1 2 0l1.5 1.5a1.4 1.4 0 0 1 0 2L9 18.5z' }]],
  horsLigne: [['path', { d: 'M3 3l18 18M7.5 8.6A5 5 0 0 0 8 18.5h9M18.6 16.6A3.8 3.8 0 0 0 17 9.5h-.6A6 6 0 0 0 9.6 5.6' }]],
  nuage: [['path', { d: 'M8 18.5a5 5 0 0 1-.4-10A6 6 0 0 1 18.5 10a4.25 4.25 0 0 1-.5 8.5z' }]],
  banque: [['path', { d: 'M3.5 9.5 12 4l8.5 5.5M5.5 10v7.5M9.8 10v7.5M14.2 10v7.5M18.5 10v7.5M3.5 20h17' }]],
  qr: [
    ['rect', { x: 4, y: 4, width: 6, height: 6, rx: 1 }],
    ['rect', { x: 14, y: 4, width: 6, height: 6, rx: 1 }],
    ['rect', { x: 4, y: 14, width: 6, height: 6, rx: 1 }],
    ['path', { d: 'M14 14h2.5v2.5M20 14v.01M14 20h.01M17 20h3v-3' }],
  ],
  lien: [['path', { d: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1' }]],
  virement: [['path', { d: 'M4 8h13M13.5 4.5 17 8l-3.5 3.5M20 16H7M10.5 12.5 7 16l3.5 3.5' }]],
  oeil: [
    ['path', { d: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z' }],
    ['circle', { cx: 12, cy: 12, r: 3 }],
  ],
  oeilBarre: [['path', { d: 'M3 3l18 18M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.6 3.3M6.6 7.6C4 9.3 2.5 12 2.5 12S6 18 12 18c1.6 0 3-.4 4.2-1M9.9 9.9a3 3 0 0 0 4.2 4.2' }]],
  vide: [
    ['circle', { cx: 12, cy: 12, r: 8 }],
    ['path', { d: 'M8.5 12.5 11 15l4.5-5' }],
  ],
};

export function icone(nom, taille = 18) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(taille));
  svg.setAttribute('height', String(taille));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icone');
  for (const [balise, attributs] of DESSINS[nom] || []) {
    const forme = document.createElementNS(NS, balise);
    for (const [cle, valeur] of Object.entries(attributs)) forme.setAttribute(cle, String(valeur));
    svg.append(forme);
  }
  return svg;
}
