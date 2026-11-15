import { randomInt } from 'node:crypto';

/**
 * Words of the passwords drawn by the server (docs/DESIGN.md §4.13): short,
 * common, without accents, so that they are typed on any keyboard.
 */
// prettier-ignore
const WORDS = [
  'abeille', 'abri', 'acier', 'agneau', 'aigle', 'airelle', 'algue', 'amande', 'ancre', 'anis',
  'arbre', 'ardoise', 'argile', 'aube', 'aulne', 'avoine', 'balcon', 'baleine', 'bambou', 'banc',
  'barque', 'bassin', 'berge', 'bise', 'bocal', 'bois', 'bouleau', 'bourg', 'branche', 'brique',
  'brise', 'bruyere', 'buisson', 'cabane', 'cadran', 'caillou', 'calme', 'canal', 'canne', 'cape',
  'carafe', 'castor', 'cedre', 'cerise', 'chalet', 'champ', 'chanvre', 'charme', 'chemin', 'chene',
  'cheval', 'cigale', 'citron', 'clairon', 'clocher', 'col', 'colline', 'comete', 'corail', 'corde',
  'coteau', 'coton', 'coupole', 'crayon', 'crique', 'cuivre', 'cygne', 'dalle', 'datte', 'delta',
  'digue', 'domaine', 'dune', 'ecluse', 'ecorce', 'ecume', 'encre', 'epice', 'erable', 'etang',
  'etoile', 'falaise', 'fanal', 'farine', 'faucon', 'fenetre', 'fenouil', 'feuille', 'figue', 'flamme',
  'fleuve', 'foin', 'fontaine', 'foret', 'fougere', 'fourmi', 'framboise', 'frene', 'gabare', 'galet',
  'genet', 'glacier', 'gland', 'grange', 'granit', 'grenier', 'griotte', 'grotte', 'guetteur', 'havre',
  'herbe', 'heron', 'hetre', 'hibou', 'houle', 'ile', 'iris', 'jardin', 'jasmin', 'jetee',
  'jonc', 'lac', 'lagune', 'lampe', 'lande', 'lanterne', 'laurier', 'lavande', 'lierre', 'lilas',
  'lin', 'loutre', 'lune', 'luzerne', 'marais', 'marbre', 'marelle', 'mariner', 'menthe', 'merle',
  'meule', 'miel', 'mimosa', 'moulin', 'mousse', 'muret', 'myrtille', 'nacre', 'navire', 'neige',
  'noisette', 'noyer', 'nuage', 'oasis', 'ocre', 'olive', 'ombre', 'onde', 'orage', 'orge',
  'orme', 'osier', 'paille', 'palme', 'papier', 'passage', 'pavot', 'pecheur', 'peuplier', 'phare',
  'pierre', 'pin', 'plaine', 'plume', 'poirier', 'pont', 'portail', 'prairie', 'quai', 'radeau',
  'rameau', 'rempart', 'renard', 'riviere', 'roche', 'roseau', 'rosier', 'ruche', 'ruisseau', 'sable',
  'safran', 'saule', 'sentier', 'sapin', 'seigle', 'silex', 'source', 'sureau', 'tamis', 'terrasse',
  'tilleul', 'toit', 'torrent', 'tourbe', 'treille', 'trefle', 'tulipe', 'vallon', 'verger', 'vigne',
  'village', 'violette', 'voile', 'volcan',
] as const;

/** « tilleul-cadran-noyer-47 »: four words and two digits, drawn by the system's generator. */
export function drawPassphrase(): string {
  const words = Array.from({ length: 4 }, () => WORDS[randomInt(WORDS.length)]);
  return `${words.join('-')}-${String(randomInt(100)).padStart(2, '0')}`;
}

export const PASSPHRASE_WORDS = WORDS.length;
