// Interface de Mes comptes, la même sur le PC et sur le téléphone. Elle affiche la « vue » reçue et envoie
// des actions ; window.comptes est fourni par le PC (preload) ou par le transport mobile.

import {
  api,
  LOGO,
  HEURE,
  etat,
  h,
  $,
  remplacer,
  euros,
  signe,
  enTexte,
  ecart,
  quand,
  jourTitre,
  depuisInstant,
  compteDe,
  toast,
  brancherVue,
  agir,
  ouvrirModale,
  fermerModale,
  pied,
  boutonIcone,
  icone,
} from './commun.js';

const PC = api.plateforme === 'pc';
// Les écrans propres au PC (banques, relevés, QR code…) ne sont chargés que sur le PC.
const outilsPC = PC ? await import('./pc.js') : null;

const PASSEES_PAR_PAGE = 30;
const JOURS_AVANT_COCHE = 3;
const ORIGINES = { telephone: 'notification', banque: 'synchronisé', import: 'relevé', mobile: 'mobile' };

// --- Écran du code -----------------------------------------------------------------------------

function ecranCode() {
  const v = etat.vue;
  if (!PC && !v.existe) return ecranJumelage(v);
  const creation = PC && !v.existe;
  const erreur = h('div', { class: 'erreur', role: 'alert' });
  const code = h('input', { type: 'password', placeholder: 'Code', autocomplete: 'off', 'aria-label': 'Code', inputmode: PC ? null : 'text' });
  const confirmation = creation ? h('input', { type: 'password', placeholder: 'Le même code, encore', autocomplete: 'off', 'aria-label': 'Confirmation du code' }) : null;
  const bouton = h('button', { class: 'principal', type: 'submit' }, creation ? 'Créer mes comptes' : 'Ouvrir');

  async function envoyer(e) {
    e.preventDefault();
    erreur.textContent = '';
    if (creation && code.value !== confirmation.value) {
      erreur.textContent = 'Les deux codes ne sont pas les mêmes.';
      return;
    }
    bouton.disabled = true;
    const r = creation ? await api.creer(code.value) : await api.ouvrir(code.value);
    bouton.disabled = false;
    if (r.erreur) {
      erreur.textContent = r.erreur;
      code.select();
      return;
    }
    appliquerVue(r.vue);
  }

  const texte = creation
    ? 'Choisis un code pour protéger tes comptes. Il sera demandé à chaque ouverture.'
    : PC
      ? 'Entre ton code pour voir tes comptes.'
      : 'Entre ton code (celui de Mes comptes sur le PC).';
  setTimeout(() => code.focus(), 40);
  return h(
    'div',
    { class: 'ecran-code' },
    h(
      'div',
      { class: 'boite-code' },
      h('img', { class: 'logo', src: LOGO, alt: '' }),
      h('h1', {}, creation ? 'Bienvenue' : 'Mes comptes'),
      h('p', {}, texte),
      h('form', { onsubmit: envoyer }, code, confirmation, bouton, erreur),
      creation
        ? h('div', { class: 'note' }, 'Les comptes sont chiffrés avec ce code : sans lui, personne ne peut les relire, toi compris. Garde-le dans ton gestionnaire de mots de passe.')
        : null
    )
  );
}

function ecranJumelage(v) {
  return h(
    'div',
    { class: 'ecran-code' },
    h(
      'div',
      { class: 'boite-code' },
      h('img', { class: 'logo', src: LOGO, alt: '' }),
      h('h1', {}, 'Relier ce téléphone'),
      v.erreurJumelage ? h('div', { class: 'erreur', role: 'alert' }, v.erreurJumelage) : null,
      h(
        'ol',
        { class: 'etapes' },
        h('li', {}, 'Sur le PC, ouvre Mes comptes → Réglages → Appli mobile.'),
        h('li', {}, 'Entre ton code : un QR code s\'affiche.'),
        h('li', {}, 'Vise-le avec l\'appareil photo de ce téléphone et ouvre le lien.')
      ),
      h('div', { class: 'note' }, 'Le QR code ne marche qu\'avec ton code : photographié par quelqu\'un d\'autre, il ne permet rien.')
    )
  );
}

// --- Tableau de bord ---------------------------------------------------------------------------

function construireTableau() {
  return [
    h(
      'div',
      { class: 'tableau' },
      h(
        'header',
        { class: 'entete' },
        h('div', { class: 'titre' }, h('img', { src: LOGO, alt: '' }), h('span', {}, 'Mes comptes')),
        h('div', { class: 'etats', id: 'etats', 'aria-live': 'polite' }),
        boutonIcone('actualiser', 'Actualiser', () => agir('synchroniser', {}, 'Comptes actualisés.')),
        boutonIcone('reglages', 'Réglages', () => ouvrirReglages()),
        boutonIcone('cadenas', 'Verrouiller', () => agir('verrouiller'))
      ),
      h('section', { class: 'heros', id: 'heros', 'aria-label': 'Disponible' }),
      h('section', { class: 'comptes', id: 'comptes', 'aria-label': 'Comptes' }),
      construireSaisie(),
      h('section', { class: 'section', id: 'a-venir' }),
      h('section', { class: 'section', id: 'passees' })
    ),
    h('div', { class: 'voile', onclick: fermerSaisie }),
    h('button', { class: 'fab', 'aria-label': 'Ajouter une opération', onclick: ouvrirSaisie }, icone('plus', 28)),
  ];
}

function rafraichirTableau() {
  const v = etat.vue;
  if (etat.filtre && !compteDe(etat.filtre)) etat.filtre = null;
  if (!etat.compte || !compteDe(etat.compte)) etat.compte = v.reglages?.compteParDefaut || v.comptes.find((c) => c.source === 'manuel')?.id || v.comptes[0].id;
  remplacer('#etats', etatsSynchro());
  remplacer('#heros', heros());
  remplacer('#comptes', v.comptes.map(carteCompte));
  rafraichirPuces();
  remplacer('#a-venir', listeAVenir());
  remplacer('#passees', listePassees());
}

function pastille(texte, sorte = '', titre = '') {
  return h('span', { class: `pastille-etat ${sorte}`, title: titre || texte }, texte);
}

function etatsSynchro() {
  const { statut, reglages } = etat.vue;
  if (!PC) {
    const pc = statut.pc;
    const elements = [];
    if (pc.envois) elements.push(pastille(`${pc.envois} envoi${pc.envois > 1 ? 's' : ''} en attente`, 'attention', 'Partiront dès que le PC répondra'));
    if (pc.etat === 'connecte') elements.push(pastille('PC connecté', 'ok'));
    else if (pc.etat === 'attente') elements.push(pastille('Connexion au PC…'));
    else elements.push(pastille(pc.vu ? `PC hors ligne · état ${depuisInstant(pc.vu)}` : 'PC hors ligne', 'attention'));
    return elements;
  }
  const elements = [];
  const q = statut.banque;
  const nom = etat.vue.comptes.find((c) => c.source === 'auto')?.nom || 'Banque';
  if (reglages.banqueAuto) {
    if (q.erreur) elements.push(pastille(`${nom} : erreur`, 'attention', q.erreur));
    else if (q.derniere) elements.push(pastille(`${nom} à jour ${HEURE.format(new Date(q.derniere))}`, 'ok'));
    else elements.push(pastille(`${nom} : lecture…`));
  }
  if (reglages.mobileRelie || reglages.lienTelephone) {
    const r = statut.relais;
    if (r.connecte) elements.push(pastille('Téléphone relié', 'ok'));
    else if (r.erreur) elements.push(pastille('Relais injoignable', 'attention', r.erreur));
    else elements.push(pastille('Connexion au relais…'));
  }
  return elements;
}

function repartition(comptes) {
  const parts = comptes.filter((c) => c.dansTotal && c.disponible > 0);
  if (parts.length < 2) return null;
  const somme = parts.reduce((s, c) => s + c.disponible, 0);
  const pourcent = (c) => Math.round((c.disponible / somme) * 100);
  return h(
    'div',
    { class: 'repartition', role: 'img', 'aria-label': `Répartition : ${parts.map((c) => `${c.nom} ${pourcent(c)} %`).join(', ')}` },
    parts.map((c) => h('span', { style: { '--c': c.couleur, flex: String(c.disponible) }, title: `${c.nom} : ${euros(c.disponible)} (${pourcent(c)} %)` }))
  );
}

function heros() {
  const { total, comptes, aVenir } = etat.vue;
  const nb = aVenir.filter((o) => compteDe(o.compte)?.dansTotal).length;
  return [
    h('div', { class: 'etiquette' }, 'Disponible maintenant, tous comptes'),
    h('div', { class: `total${total.disponible < 0 ? ' negatif' : ''}` }, euros(total.disponible)),
    h(
      'div',
      { class: 'detail' },
      h('span', { class: 'tabulaire' }, `Selon les banques ${euros(total.banque)}`),
      nb ? h('span', { class: 'tabulaire' }, ` · pas encore passé ${signe(total.aVenir)}`) : ' · rien en attente',
      total.incomplet ? h('span', { class: 'alerte' }, ' · un solde reste à renseigner') : null
    ),
    repartition(comptes),
  ];
}

function carteCompte(c) {
  const choisi = etat.filtre === c.id;
  const actions = [];
  const arreter = (rappel) => (e) => {
    e.stopPropagation();
    rappel();
  };
  if (c.source === 'manuel') {
    actions.push(h('button', { onclick: arreter(() => ouvrirSolde(c.id)) }, c.soldeBanque === null ? 'Renseigner le solde' : 'Mettre à jour le solde'));
    if (outilsPC) actions.push(h('button', { onclick: arreter(() => outilsPC.ouvrirImport(c.id)) }, icone('importer', 15), 'Relevé'));
  } else if (PC && !etat.vue.reglages.banqueAuto) {
    actions.push(h('button', { class: 'principal', onclick: arreter(() => ouvrirReglages('banque')) }, 'Connecter'));
  }
  const source = c.source === 'auto' ? 'automatique' : 'à la main';
  return h(
    'article',
    {
      class: `carte-compte${choisi ? ' choisi' : ''}${c.dansTotal ? '' : ' hors-total'}`,
      style: { '--c': c.couleur },
      tabindex: '0',
      'aria-pressed': choisi ? 'true' : 'false',
      title: choisi ? 'Afficher tous les comptes' : `N'afficher que ${c.nom}`,
      onclick: () => filtrer(c.id),
      onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), filtrer(c.id)),
    },
    h('div', { class: 'nom' }, c.nom, h('span', { class: 'source' }, c.dansTotal ? source : `${source} · hors total`)),
    c.soldeBanque === null
      ? h('div', { class: 'vide' }, c.source === 'auto' ? 'Le solde arrive dès la connexion.' : 'Solde pas encore renseigné.')
      : h('div', { class: `dispo${c.disponible < 0 ? ' negatif' : ''}` }, euros(c.disponible)),
    c.soldeBanque !== null
      ? h('div', { class: 'ligne tabulaire' }, h('span', {}, `Banque ${depuisInstant(c.soldeDate)}`), h('span', {}, euros(c.soldeBanque)))
      : null,
    h('div', { class: 'ligne tabulaire' }, h('span', {}, c.nbAVenir ? `Pas encore passé (${c.nbAVenir})` : 'Pas encore passé'), h('span', {}, c.nbAVenir ? signe(c.aVenir) : '—')),
    actions.length ? h('div', { class: 'actions' }, actions) : null
  );
}

function filtrer(id) {
  etat.filtre = etat.filtre === id ? null : id;
  etat.passeesVisibles = PASSEES_PAR_PAGE;
  rafraichirTableau();
}

// --- Saisie (dans la page sur le PC, en panneau sur le téléphone) ------------------------------

function construireSaisie() {
  const montant = h('input', { type: 'text', id: 'saisie-montant', inputmode: 'decimal', placeholder: '0,00', 'aria-label': 'Montant', autocomplete: 'off', enterkeyhint: 'next' });
  const libelle = h('input', { type: 'text', id: 'saisie-libelle', placeholder: 'Quoi ? (Carrefour, essence, loyer…)', 'aria-label': 'Libellé', maxlength: '80', autocomplete: 'off', enterkeyhint: 'done' });
  const date = h('input', { type: 'date', id: 'saisie-date', 'aria-label': 'Date' });
  const entree = (e) => e.key === 'Enter' && (e.preventDefault(), ajouter());
  montant.addEventListener('keydown', entree);
  libelle.addEventListener('keydown', entree);
  const onglets = [
    ['depense', 'Dépense', 'Dépense'],
    ['rentree', 'Rentrée', 'Rentrée'],
    ['virement', 'Virement entre mes comptes', 'Virement'],
  ].map(([sens, long, court]) =>
    h('button', { class: 'onglet', 'data-sens': sens, onclick: () => choisirSens(sens) }, h('span', { class: 'long' }, long), long === court ? null : h('span', { class: 'court' }, court))
  );
  return h(
    'section',
    { class: 'saisie', id: 'saisie', 'aria-label': 'Ajouter une opération' },
    h('div', { class: 'poignee' }),
    h('div', { class: 'titre-saisie' }, 'Nouvelle opération'),
    h('div', { class: 'haut' }, onglets, h('span', { class: 'astuce' }, 'Entrée pour ajouter · compté tout de suite dans le disponible')),
    h('div', { class: 'champs' }, h('div', { class: 'montant' }, montant, h('span', {}, '€')), libelle, date),
    h(
      'div',
      { class: 'bas' },
      h('span', { class: 'quoi', id: 'quoi-de' }, 'Compte'),
      h('span', { class: 'puces', id: 'puces-de' }),
      h('span', { class: 'quoi', id: 'quoi-vers' }, 'vers'),
      h('span', { class: 'puces', id: 'puces-vers' }),
      h('button', { class: 'principal ajouter', onclick: ajouter }, icone('plus', 16), 'Ajouter')
    )
  );
}

function ouvrirSaisie() {
  document.body.classList.add('saisie-ouverte');
  setTimeout(() => $('#saisie-montant')?.focus(), 230);
}

function fermerSaisie() {
  document.body.classList.remove('saisie-ouverte');
}

function choisirSens(sens) {
  etat.sens = sens;
  rafraichirPuces();
  $('#saisie-montant')?.focus();
}

function rafraichirPuces() {
  const v = etat.vue;
  const virement = etat.sens === 'virement';
  if (virement && (!etat.vers || etat.vers === etat.compte)) etat.vers = v.comptes.find((c) => c.id !== etat.compte)?.id;
  for (const b of document.querySelectorAll('.onglet')) b.classList.toggle('actif', b.dataset.sens === etat.sens);
  const puces = (choisi, rappel, exclure) =>
    v.comptes
      .filter((c) => c.id !== exclure)
      .map((c) => h('button', { class: `puce${c.id === choisi ? ' actif' : ''}`, style: { '--c': c.couleur }, 'aria-pressed': c.id === choisi ? 'true' : 'false', onclick: () => rappel(c.id) }, c.nom));
  remplacer(
    '#puces-de',
    puces(etat.compte, (id) => {
      etat.compte = id;
      localStorage.setItem('mc.compte', id);
      rafraichirPuces();
    })
  );
  remplacer(
    '#puces-vers',
    virement
      ? puces(
          etat.vers,
          (id) => {
            etat.vers = id;
            rafraichirPuces();
          },
          etat.compte
        )
      : []
  );
  $('#quoi-de').textContent = virement ? 'De' : 'Compte';
  $('#quoi-vers').hidden = !virement;
  const date = $('#saisie-date');
  if (date && !date.value) date.value = v.aujourdhui;
}

async function ajouter() {
  const montant = $('#saisie-montant');
  const libelle = $('#saisie-libelle');
  const date = $('#saisie-date');
  if (!montant.value.trim()) {
    montant.focus();
    toast('Écris un montant.', true);
    return;
  }
  const commun = { montant: montant.value, libelle: libelle.value, date: date.value || etat.vue.aujourdhui };
  const r =
    etat.sens === 'virement'
      ? await agir('virement', { ...commun, de: etat.compte, vers: etat.vers }, 'Virement ajouté.')
      : await agir('ajouter', { ...commun, compte: etat.compte, sens: etat.sens }, etat.sens === 'depense' ? 'Dépense ajoutée.' : 'Rentrée ajoutée.');
  if (!r) return;
  montant.value = '';
  libelle.value = '';
  date.value = etat.vue.aujourdhui;
  if (document.body.classList.contains('saisie-ouverte')) fermerSaisie();
  else montant.focus();
}

// --- Listes, groupées par jour -----------------------------------------------------------------

function filtrees(liste) {
  return etat.filtre ? liste.filter((o) => o.compte === etat.filtre) : liste;
}

function titreSection(texte, aide) {
  const c = etat.filtre ? compteDe(etat.filtre) : null;
  return h('h2', {}, texte, h('small', {}, aide), c ? h('button', { class: 'discret filtre', onclick: () => filtrer(c.id) }, `${c.nom} seulement · tout afficher`) : null);
}

function parJour(ops, enAttente) {
  const lignes = [];
  let jour = null;
  for (const o of ops) {
    if (o.date !== jour) {
      jour = o.date;
      lignes.push(h('div', { class: 'jour' }, jourTitre(o.date)));
    }
    lignes.push(ligneOperation(o, enAttente));
  }
  return lignes;
}

function listeAVenir() {
  const ops = filtrees(etat.vue.aVenir);
  return [
    titreSection('Pas encore passé à la banque', 'déjà retiré du disponible'),
    h(
      'div',
      { class: 'liste' },
      ops.length
        ? parJour(ops, true)
        : h('div', { class: 'rien' }, icone('vide', 22), 'Rien en attente : tout ce que tu as payé est déjà passé à la banque.')
    ),
  ];
}

function listePassees() {
  const toutes = filtrees(etat.vue.passees);
  const ops = toutes.slice(0, etat.passeesVisibles);
  return [
    titreSection('Déjà passé', 'dans le solde des banques'),
    h(
      'div',
      { class: 'liste' },
      ops.length ? parJour(ops, false) : h('div', { class: 'rien' }, "Pas encore d'historique."),
      toutes.length > ops.length
        ? h(
            'button',
            {
              class: 'plus',
              onclick: () => {
                etat.passeesVisibles += PASSEES_PAR_PAGE;
                remplacer('#passees', listePassees());
              },
            },
            `Voir plus (${toutes.length - ops.length})`
          )
        : null
    ),
  ];
}

const peutPasser = (o, c) => o.etat === 'a_venir' && c.source === 'manuel' && o.origine !== 'banque' && !o.envoi;

function ligneOperation(o, enAttente) {
  const c = compteDe(o.compte) || { nom: '?', couleur: '#888', source: 'manuel' };
  const gestes = [];
  if (o.envoi) gestes.push(h('span', { class: 'badge attention' }, 'envoi au PC…'));
  else if (enAttente && o.origine === 'banque') gestes.push(h('span', { class: 'info' }, 'La banque le traite'));
  else if (peutPasser(o, c)) {
    gestes.push(
      h(
        'button',
        {
          title: "La banque l'affiche maintenant : il passe dans le solde",
          onclick: (e) => {
            e.stopPropagation();
            agir('passee', { id: o.id }, 'Marqué comme passé.');
          },
        },
        icone('coche', 15),
        "C'est passé"
      )
    );
  }
  const meta = [c.nom, ORIGINES[o.origine], o.lien ? 'virement' : null].filter(Boolean).join(' · ');
  return h(
    'div',
    {
      class: `op${o.envoi ? ' envoi' : ''}`,
      role: 'button',
      tabindex: '0',
      'aria-label': `${o.libelle}, ${signe(o.montant)}, ${c.nom}`,
      onclick: () => ouvrirOperation(o),
      onkeydown: (e) => e.key === 'Enter' && ouvrirOperation(o),
    },
    h('span', { class: 'point', style: { '--c': c.couleur } }),
    h('span', { class: 'corps' }, h('span', { class: 'libelle' }, o.libelle), h('span', { class: 'meta' }, meta)),
    h('span', { class: `somme tabulaire${o.montant > 0 ? ' credit' : ''}` }, signe(o.montant)),
    h('span', { class: 'gestes' }, gestes)
  );
}

// --- Une opération : la voir, la corriger, la pointer, la supprimer ----------------------------

function ouvrirOperation(o) {
  const c = compteDe(o.compte);
  const figee = o.envoi;
  const viaBanque = Boolean(o.ref) || o.origine === 'banque';
  const libelle = h('input', { type: 'text', value: o.libelle, maxlength: '80', disabled: figee });
  const montant = h('input', { type: 'text', class: 'tabulaire', inputmode: 'decimal', value: enTexte(o.montant), disabled: figee || viaBanque });
  const sens = h(
    'select',
    { disabled: figee || viaBanque },
    h('option', { value: 'depense' }, 'Dépense'),
    h('option', { value: 'rentree' }, 'Rentrée')
  );
  sens.value = o.montant > 0 ? 'rentree' : 'depense';
  const date = h('input', { type: 'date', value: o.date, disabled: figee || viaBanque });
  const compte = h('select', { disabled: figee || viaBanque || Boolean(o.lien) }, etat.vue.comptes.map((x) => h('option', { value: x.id }, x.nom)));
  compte.value = o.compte;

  async function enregistrer() {
    const champs = { id: o.id, libelle: libelle.value };
    if (!viaBanque) Object.assign(champs, { montant: montant.value, sens: sens.value, date: date.value });
    if (!viaBanque && !o.lien && compte.value !== o.compte) champs.compte = compte.value;
    if (await agir('modifier', champs, 'Modifié.')) fermerModale();
  }
  libelle.addEventListener('keydown', (e) => e.key === 'Enter' && enregistrer());

  let confirmer = false;
  const supprimer = h('button', { class: 'discret danger gauche' }, icone('corbeille', 16), 'Supprimer');
  supprimer.addEventListener('click', async () => {
    if (!confirmer) {
      confirmer = true;
      supprimer.className = 'confirmer gauche';
      supprimer.lastChild.textContent = o.lien ? 'Supprimer les deux côtés ?' : 'Vraiment supprimer ?';
      return;
    }
    if (await agir('supprimer', { id: o.id }, 'Supprimé.')) fermerModale();
  });
  const passer = peutPasser(o, c)
    ? h(
        'button',
        {
          onclick: async () => {
            if (await agir('passee', { id: o.id }, 'Marqué comme passé.')) fermerModale();
          },
        },
        icone('coche', 16),
        "C'est passé"
      )
    : null;

  ouvrirModale([
    h(
      'div',
      { class: 'entete-op' },
      h('span', { class: 'pastille', style: { '--c': c.couleur } }),
      h('div', {}, h('div', { class: 'aide' }, `${c.nom} · ${quand(o.date)}${ORIGINES[o.origine] ? ` · ${ORIGINES[o.origine]}` : ''}`), h('div', { class: `montant-op${o.montant > 0 ? ' credit' : ''}` }, signe(o.montant))),
      h('span', { class: `badge etat-op${o.etat === 'a_venir' ? ' attention' : ''}` }, o.envoi ? 'envoi au PC…' : o.etat === 'a_venir' ? 'pas encore passé' : 'passé')
    ),
    figee ? h('p', { class: 'aide' }, "En route vers le PC : tu pourras la modifier dès qu'il l'aura reçue.") : null,
    viaBanque && !figee ? h('p', { class: 'aide' }, 'Retrouvée chez la banque : seul le libellé se modifie.') : null,
    h('label', { class: 'champ' }, h('span', {}, 'Libellé'), libelle),
    h('div', { class: 'deux-champs' }, h('label', { class: 'champ' }, h('span', {}, 'Montant (€)'), montant), h('label', { class: 'champ' }, h('span', {}, 'Sens'), sens)),
    h('div', { class: 'deux-champs' }, h('label', { class: 'champ' }, h('span', {}, 'Date'), date), h('label', { class: 'champ' }, h('span', {}, 'Compte'), compte)),
    figee ? pied() : pied(o.origine !== 'banque' ? supprimer : null, passer, h('button', { class: 'principal', onclick: enregistrer }, 'Enregistrer')),
  ], { focusAuto: false });
}

function ouvrirSolde(compteId) {
  const c = compteDe(compteId);
  const ops = etat.vue.aVenir.filter((o) => o.compte === compteId && !o.envoi);
  const montant = h('input', { type: 'text', class: 'grand tabulaire', inputmode: 'decimal', placeholder: '0,00', value: c.soldeBanque === null ? '' : (c.soldeBanque / 100).toFixed(2).replace('.', ',') });
  const cases = ops.map((o) =>
    h(
      'label',
      {},
      h('input', { type: 'checkbox', value: o.id, checked: ecart(etat.vue.aujourdhui, o.date) >= JOURS_AVANT_COCHE }),
      h('span', { class: 'quand' }, quand(o.date)),
      h('span', {}, o.libelle),
      h('span', { class: 'tabulaire' }, signe(o.montant))
    )
  );
  async function valider() {
    const dejaPasses = cases.map((l) => l.querySelector('input')).filter((i) => i.checked).map((i) => i.value);
    if (await agir('solde', { compte: compteId, montant: montant.value, dejaPasses }, 'Solde mis à jour.')) fermerModale();
  }
  montant.addEventListener('keydown', (e) => e.key === 'Enter' && valider());
  ouvrirModale([
    h('h3', {}, `Solde ${c.nom}`),
    h('p', { class: 'sous-titre' }, "Recopie le solde affiché dans l'appli ou sur le site de la banque."),
    h('label', { class: 'champ' }, h('span', {}, 'Solde affiché par la banque (€)'), montant),
    ops.length
      ? [
          h('p', { class: 'aide' }, "Coche ce que la banque affiche déjà dans ses opérations : c'est déjà compté dans ce solde. Les autres restent « pas encore passé »."),
          h('div', { class: 'choix-liste' }, cases),
        ]
      : null,
    pied(h('button', { class: 'principal', onclick: valider }, 'Enregistrer')),
  ]);
}

// --- Réglages ----------------------------------------------------------------------------------

function ouvrirReglages(section) {
  const boite = ouvrirModale(h('div', { id: 'reglages' }), { large: true, focusAuto: false });
  remplirReglages(boite.querySelector('#reglages'), true);
  if (section) boite.querySelector(`[data-section="${section}"]`)?.scrollIntoView();
}

function remplirReglages(racine, force) {
  if (!racine) return;
  const focus = document.activeElement;
  const enSaisie = focus && racine.contains(focus) && focus.tagName === 'INPUT' && ['text', 'password'].includes(focus.type);
  if (enSaisie && !force) return; // ne pas effacer une saisie en cours
  const defilement = racine.parentElement.scrollTop;
  racine.replaceChildren(...(PC ? outilsPC.reglages(etat.vue, () => rafraichirReglages(true)) : reglagesMobile(etat.vue)));
  racine.parentElement.scrollTop = defilement;
}

function rafraichirReglages(force = false) {
  remplirReglages($('#reglages'), force);
}

function reglagesMobile(v) {
  const pc = v.statut.pc;
  let confirmer = false;
  const delier = h('button', { class: 'discret danger' }, icone('lien', 16), 'Délier ce téléphone');
  delier.addEventListener('click', async () => {
    if (!confirmer) {
      confirmer = true;
      delier.className = 'confirmer';
      delier.lastChild.textContent = 'Effacer les comptes de ce téléphone ?';
      return;
    }
    await agir('delier', {}, 'Téléphone délié.');
  });
  return [
    h('h3', {}, 'Réglages'),
    h('p', { class: 'sous-titre' }, 'Les autres réglages (banques, notifications, comptes) se font sur le PC.'),
    h(
      'section',
      { class: 'reglage' },
      h('h4', {}, icone('telephone', 18), 'Cet appareil'),
      h(
        'p',
        { class: 'aide' },
        pc.etat === 'connecte' ? pastille('PC connecté', 'ok') : pastille(pc.vu ? `PC hors ligne · état ${depuisInstant(pc.vu)}` : 'PC hors ligne', 'attention'),
        ' ',
        "Tout ce qui passe entre ce téléphone et le PC est chiffré de bout en bout. L'appli se verrouille après 5 minutes en arrière-plan."
      ),
      h('div', { class: 'boutons' }, h('button', { onclick: () => (fermerModale(), agir('verrouiller')) }, icone('cadenas', 16), 'Verrouiller'), delier)
    ),
    h('div', { class: 'pied' }, h('button', { class: 'principal', onclick: fermerModale }, 'Fermer')),
  ];
}

// --- Cycle de vie ------------------------------------------------------------------------------

function annoncer(v) {
  for (const a of v.annonces || []) {
    if (etat.annoncesVues.has(a.id)) continue;
    etat.annoncesVues.add(a.id);
    toast(a.texte, a.erreur);
  }
}

// Téléphone déverrouillé mais pas encore de nouvelles du PC (premier jumelage).
function ecranChargement(v) {
  const horsLigne = v.statut.pc.etat === 'hors-ligne';
  return h(
    'div',
    { class: 'ecran-code' },
    h(
      'div',
      { class: 'boite-code' },
      h('img', { class: 'logo', src: LOGO, alt: '' }),
      h('h1', {}, horsLigne ? 'Le PC ne répond pas' : 'Récupération des comptes…'),
      h(
        'p',
        {},
        horsLigne
          ? 'Ouvre Mes comptes sur le PC (allumé et connecté à Internet) : les comptes apparaîtront ici tout seuls.'
          : 'Le PC envoie tes comptes, chiffrés, par le relais.'
      ),
      h('button', { onclick: () => agir('synchroniser') }, icone('actualiser', 16), 'Réessayer')
    )
  );
}

function appliquerVue(v) {
  etat.vue = v;
  const mode = v.verrouille ? (v.existe ? 'code' : 'accueil') : v.chargement ? 'chargement' : 'tableau';
  if (mode !== etat.mode || mode === 'chargement') {
    etat.mode = mode;
    fermerModale();
    fermerSaisie();
    const ecran = mode === 'tableau' ? construireTableau() : mode === 'chargement' ? ecranChargement(v) : ecranCode();
    $('#app').replaceChildren(...[ecran].flat());
  }
  if (mode === 'tableau') {
    rafraichirTableau();
    rafraichirReglages();
  }
  annoncer(v);
}

brancherVue(appliquerVue);

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('#modale').hidden) fermerModale();
  else fermerSaisie();
});

async function demarrer() {
  api.surMaj(appliquerVue);
  appliquerVue(await api.vue());
  const ecran = new URLSearchParams(location.search).get('ecran');
  if (ecran && !etat.vue.verrouille) {
    if (ecran === 'reglages') ouvrirReglages();
    else if (ecran === 'saisie') ouvrirSaisie();
    else if (ecran.startsWith('solde-')) ouvrirSolde(ecran.slice(6));
    else if (ecran.startsWith('import-') && outilsPC) outilsPC.ouvrirImport(ecran.slice(7));
    else if (ecran === 'operation' && etat.vue.aVenir[0]) ouvrirOperation(etat.vue.aVenir[0]);
  }
}

demarrer();
