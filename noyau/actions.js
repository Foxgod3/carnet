// Les actions sur les comptes, identiques sur le PC et sur le téléphone.
// Le PC les applique pour de vrai ; le téléphone les applique à sa copie pour afficher le résultat tout de suite,
// puis envoie la même commande au PC. Les arguments sont ceux que tape Gabin (montants en texte).

import * as L from './logique.js';

// Ce que le téléphone a le droit de demander au PC. Tout le reste (banques, relevés, code…) reste sur le PC.
export const ACTIONS_MOBILE = new Set(['ajouter', 'virement', 'passee', 'supprimer', 'modifier', 'solde']);

function centimes(texte, sens) {
  const valeur = L.versCentimes(texte);
  if (!valeur) throw new Error('Écris un montant, par exemple 12,50.');
  if (sens === 'depense') return -Math.abs(valeur);
  if (sens === 'rentree') return Math.abs(valeur);
  return valeur;
}

function texte(valeur, max = 200) {
  if (valeur === undefined || valeur === null) return undefined;
  if (typeof valeur !== 'string' || valeur.length > max) throw new Error('Champ invalide.');
  return valeur;
}

export const ACTIONS = {
  ajouter(d, { id, compte, montant, sens, libelle, date, origine }) {
    return L.ajouterOperation(d, {
      id,
      compte: texte(compte, 20),
      montant: centimes(texte(montant, 30), sens),
      libelle: texte(libelle),
      date: texte(date, 10),
      origine: origine === 'mobile' ? 'mobile' : 'manuel',
    });
  },
  virement(d, { id, id2, de, vers, montant, libelle, date, origine }) {
    return L.virement(d, {
      id,
      id2,
      de: texte(de, 20),
      vers: texte(vers, 20),
      montant: Math.abs(centimes(texte(montant, 30))),
      libelle: texte(libelle),
      date: texte(date, 10),
      origine: origine === 'mobile' ? 'mobile' : 'manuel',
    });
  },
  passee(d, { id }) {
    return L.marquerPassee(d, texte(id, 40));
  },
  supprimer(d, { id }) {
    const op = d.operations.find((o) => o.id === id);
    if (op?.origine === 'banque') throw new Error("Cette opération vient de la banque : elle disparaîtra si la banque l'annule.");
    return L.supprimer(d, texte(id, 40));
  },
  modifier(d, { id, libelle, montant, sens, date, compte }) {
    const champs = { libelle: texte(libelle), date: texte(date, 10), compte: texte(compte, 20) };
    if (montant !== undefined) champs.montant = centimes(texte(montant, 30), sens);
    return L.modifier(d, texte(id, 40), champs);
  },
  solde(d, { compte, montant, dejaPasses }) {
    const valeur = L.versCentimes(texte(montant, 30));
    if (valeur === null) throw new Error('Écris le solde, par exemple 1 234,56 (ou -45,00).');
    const ids = Array.isArray(dejaPasses) ? dejaPasses.filter((x) => typeof x === 'string').slice(0, 500) : [];
    return L.nouveauSolde(d, texte(compte, 20), valeur, ids);
  },
  compte(d, { id, nom, dansTotal }) {
    const c = d.comptes.find((x) => x.id === id);
    if (!c) throw new Error('Compte inconnu.');
    if (typeof nom === 'string') {
      const propre = L.nettoyerLibelle(nom).slice(0, 40);
      if (propre) c.nom = propre;
    }
    if (typeof dansTotal === 'boolean') c.dansTotal = dansTotal;
    return c;
  },
};

// Une commande du téléphone : { i: identifiant, n: nom, a: arguments, t: instant }. Refuse tout ce qui sort du cadre.
export function verifierCommande(cmd, maintenant = Date.now()) {
  if (!cmd || typeof cmd !== 'object') throw new Error('Commande illisible.');
  const { i, n, a, t } = cmd;
  if (typeof i !== 'string' || !/^[A-Za-z0-9_-]{8,32}$/.test(i)) throw new Error('Commande sans identifiant.');
  if (n !== 'synchroniser' && !ACTIONS_MOBILE.has(n)) throw new Error('Action refusée depuis le téléphone.');
  if (!Number.isSafeInteger(t) || t < maintenant - 14 * 86_400_000 || t > maintenant + 86_400_000) {
    throw new Error('Commande trop ancienne ou datée du futur.');
  }
  if (a !== undefined && (typeof a !== 'object' || a === null || Array.isArray(a))) throw new Error('Arguments illisibles.');
  return { i, n, a: { ...(a || {}), origine: 'mobile' }, t };
}
