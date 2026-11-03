// Outils partagés par toute l'interface (PC et téléphone) : construction du DOM, formats, messages, fenêtres.

import { icone } from './icones.js';

export { icone };
export const api = window.comptes;
export const LOGO = new URL('./icone.png', import.meta.url).href;

const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
export const HEURE = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const JOUR_COURT = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const JOUR_TITRE = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const JOUR_LONG = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });

// L'état de l'interface : la dernière vue reçue et les choix en cours.
export const etat = {
  vue: null,
  mode: null,
  filtre: null,
  sens: 'depense',
  compte: localStorage.getItem('mc.compte'),
  vers: null,
  passeesVisibles: 30,
  annoncesVues: new Set(),
};

export function h(tag, props, ...enfants) {
  const el = document.createElement(tag);
  for (const [cle, valeur] of Object.entries(props || {})) {
    if (valeur === undefined || valeur === null || valeur === false) continue;
    if (cle === 'class') el.className = valeur;
    else if (cle === 'style') for (const [p, v] of Object.entries(valeur)) el.style.setProperty(p, v);
    else if (cle.startsWith('on')) el.addEventListener(cle.slice(2), valeur);
    else if (['value', 'checked', 'disabled', 'hidden'].includes(cle)) el[cle] = valeur;
    else el.setAttribute(cle, valeur === true ? '' : valeur);
  }
  for (const enfant of enfants.flat(Infinity)) {
    if (enfant === null || enfant === undefined || enfant === false) continue;
    el.append(enfant instanceof Node ? enfant : document.createTextNode(String(enfant)));
  }
  return el;
}

export const $ = (selecteur, racine = document) => racine.querySelector(selecteur);

export function remplacer(selecteur, contenu) {
  const el = $(selecteur);
  if (el) el.replaceChildren(...[contenu].flat().filter(Boolean));
}

export const euros = (centimes) => EUR.format(centimes / 100);

export function signe(centimes) {
  const absolu = EUR.format(Math.abs(centimes) / 100);
  if (centimes > 0) return `+${absolu}`;
  if (centimes < 0) return `−${absolu}`;
  return absolu;
}

export const enTexte = (centimes) => (Math.abs(centimes) / 100).toFixed(2).replace('.', ',');

export function ecart(a, b) {
  return Math.round((Date.parse(`${a}T12:00:00`) - Date.parse(`${b}T12:00:00`)) / 86_400_000);
}

export function quand(date) {
  const d = ecart(etat.vue.aujourdhui, date);
  if (d === 0) return "Aujourd'hui";
  if (d === 1) return 'Hier';
  if (d === -1) return 'Demain';
  return JOUR_COURT.format(new Date(`${date}T12:00:00`));
}

export function jourTitre(date) {
  const d = ecart(etat.vue.aujourdhui, date);
  if (d === 0) return "Aujourd'hui";
  if (d === 1) return 'Hier';
  if (d === -1) return 'Demain';
  const texte = JOUR_TITRE.format(new Date(`${date}T12:00:00`));
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

// « à 14:02 » aujourd'hui, sinon « au 2 novembre ».
export function depuisInstant(instant) {
  if (!instant) return '';
  const d = new Date(instant);
  const jour = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return jour === etat.vue.aujourdhui ? `à ${HEURE.format(d)}` : `au ${JOUR_LONG.format(d)}`;
}

export const compteDe = (id) => etat.vue.comptes.find((c) => c.id === id);

let minuterieToast = null;
export function toast(texte, erreur = false) {
  const t = $('#toast');
  t.textContent = texte;
  t.className = `visible${erreur ? ' erreur' : ''}`;
  clearTimeout(minuterieToast);
  minuterieToast = setTimeout(() => (t.className = ''), erreur ? 5000 : 2600);
}

let appliquer = () => {};
export function brancherVue(rappel) {
  appliquer = rappel;
}

export async function agir(nom, args, succes) {
  const r = await api.action(nom, args);
  if (r.erreur) {
    toast(r.erreur, true);
    return null;
  }
  if (r.vue) appliquer(r.vue);
  if (succes) toast(succes);
  return r;
}

// --- Fenêtres (sur le téléphone : panneaux qui montent du bas) -----------------------------------

export function ouvrirModale(contenu, { large = false, focusAuto = true } = {}) {
  const fond = $('#modale');
  const boite = h('div', { class: `boite${large ? ' large' : ''}`, role: 'dialog', 'aria-modal': 'true', tabindex: '-1' }, contenu);
  fond.replaceChildren(boite);
  fond.hidden = false;
  // Un gestionnaire « onclick » qui renvoie false annule le clic (cases à cocher comprises) : pas de valeur de retour.
  fond.onclick = (e) => {
    if (e.target === fond) fermerModale();
  };
  setTimeout(() => (focusAuto ? boite.querySelector('input:not([type=checkbox]):not([disabled]), button.principal') : boite)?.focus(), 30);
  return boite;
}

export function fermerModale() {
  const fond = $('#modale');
  fond.hidden = true;
  fond.replaceChildren();
}

// Bas de fenêtre : un bouton de classe « gauche » (Supprimer) se met à gauche, puis Annuler, puis les autres.
export function pied(...boutons) {
  const liste = boutons.flat().filter(Boolean);
  const gauche = liste.filter((b) => b.classList.contains('gauche'));
  const droite = liste.filter((b) => !b.classList.contains('gauche'));
  return h('div', { class: 'pied' }, gauche, h('button', { onclick: fermerModale }, 'Annuler'), droite);
}

// Champ de code avec un œil pour voir ce qu'on tape. Le clavier du téléphone ne corrige rien :
// ni majuscule automatique, ni correction, ni apostrophe typographique.
export function champCode(props = {}) {
  const input = h('input', { type: 'password', autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', ...props });
  const oeil = h('button', { type: 'button', class: 'oeil discret', 'aria-label': 'Voir le code', title: 'Voir le code' }, icone('oeil', 18));
  oeil.addEventListener('click', () => {
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    oeil.replaceChildren(icone(visible ? 'oeilBarre' : 'oeil', 18));
    oeil.setAttribute('aria-label', visible ? 'Cacher le code' : 'Voir le code');
    oeil.title = visible ? 'Cacher le code' : 'Voir le code';
    input.focus();
  });
  const enveloppe = h('div', { class: 'champ-code' }, input, oeil);
  enveloppe.champ = input;
  return enveloppe;
}

export function boutonIcone(nomIcone, etiquette, onclick, classe = 'discret') {
  return h('button', { class: classe, title: etiquette, 'aria-label': etiquette, onclick }, icone(nomIcone), h('span', { class: 'etiquette-bouton' }, etiquette));
}
