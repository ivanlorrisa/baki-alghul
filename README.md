# Baki · Al-ghūl — version web installable sur iPhone

Une seule app, deux espaces : **Baki** (musculation) et **Al-ghūl** (Muay thaï). Un seul profil, un seul calendrier.
Elle s'installe depuis Safari, sans Mac, sans App Store, et fonctionne hors connexion.

## Fichiers à mettre en ligne

Les 10 fichiers à la racine : `index.html`, `styles.css`, `data.js`, `engine.js`, `app.js`, `sw.js`,
`manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`.
Le dossier `tests/` sert uniquement aux vérifications et n'a pas besoin d'être en ligne.

## Mettre l'app en ligne avec GitHub Pages, depuis l'iPhone

1. Dézippe l'archive dans l'app **Fichiers** (touche le fichier .zip).
2. Sur **github.com**, connecte-toi, puis **+ › New repository**. Nom : `baki-alghul`, visibilité **Public**, puis **Create repository**.
3. Touche **uploading an existing file**, puis sélectionne les 10 fichiers et **Commit changes**.
4. Va dans **Settings › Pages**. Sous *Branch*, choisis `main` et `/ (root)`, puis **Save**.
5. Après une à deux minutes, l'adresse s'affiche : `https://TON-PSEUDO.github.io/baki-alghul/`.

## Installer l'app sur l'iPhone

1. Ouvre l'adresse dans **Safari** (pas dans Chrome).
2. Touche **Partager** ⬆︎, puis **Sur l'écran d'accueil**, puis **Ajouter**.
3. Lance l'app depuis son icône : elle s'ouvre en plein écran et reste utilisable hors connexion.

## À savoir

- **Tes données restent sur ton iPhone**, dans l'app installée : aucun compte, aucun serveur. Exporte régulièrement une archive chiffrée (*Profil › Données*), surtout avant de changer de téléphone ou d'effacer les données de Safari.
- **Mises à jour** : quand une nouvelle version est mise en ligne, ouvre l'app connecté à Internet, ferme-la, puis rouvre-la.

### Limites de la version web par rapport à la version native

- Pas de rappels de séance.
- Le minuteur ne sonne pas écran verrouillé. Il reste exact, car il se base sur l'heure réelle. L'écran reste allumé pendant les rounds quand iOS le permet. Les rounds écoulés hors écran te sont demandés au retour : ils ne sont jamais comptés d'office.
- Pas de vibration et pas de Face ID.

## Vérifications effectuées

- **Moteur** : 14 tests automatisés (`node --test tests/engine.test.js`), qui reprennent les scénarios de recette T01, T03 à T09 et les règles de sécurité.
- **Parcours complet** testé sur un écran de la taille d'un iPhone 13 : création du profil, activation du programme, séance de musculation avec reprise après rechargement, rounds de Muay thaï, point du jour, retour de séance, export puis réimport chiffré, fonctionnement hors connexion.
- **Contenus** : catalogue et règles identiques à la version native (49 fiches de musculation, 35 de Muay thaï). Ce sont encore des brouillons, à faire valider par un coach qualifié.
