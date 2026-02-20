# img2webp

Application web statique pour convertir, redimensionner et optimiser des images JPG/PNG directement dans le navigateur, sans dépendance serveur.

## Fonctionnalités

### Import & gestion des fichiers
- Import par glisser-déposer ou via sélecteur de fichiers.
- Prise en charge des formats d'entrée JPG, JPEG et PNG.
- Traitement par lot avec limite de 30 images par session.
- Suppression individuelle d'une image ou réinitialisation complète de la sélection.
- Prévisualisation immédiate pour chaque image ajoutée.

### Conversion & export
- Choix du format de sortie image par image : **WebP**, **JPG** ou **PNG**.
- Réglage du niveau de compression (qualité 1–100) pour WebP/JPG.
- Génération d'une estimation de poids converti avant téléchargement.
- Téléchargement individuel de chaque image convertie.
- Téléchargement global de toutes les images converties (export séquentiel).

### Redimensionnement
- Deux modes de redimensionnement :
  - **Pixels** (largeur/hauteur personnalisées).
  - **Pourcentage** (25 %, 50 %, 75 %).
- Option de conservation automatique des proportions en mode pixels.
- Mise à jour dynamique des dimensions de sortie selon les réglages.

### Édition visuelle
- **Recadrage interactif** sur chaque vignette (activation, sélection, validation, réinitialisation).
- **Suppression automatique de fond** (approche locale type détection de bordure + tolérance réglable).
- Contrôle de la **tolérance** de suppression de fond (10 à 160).
- Définition d'une couleur d'arrière-plan de remplacement :
  - via sélecteur visuel,
  - via saisie texte (`transparent`, hex, nom CSS).

### Nommage & ergonomie
- Champ de renommage par image avec suffixe d'extension mis à jour automatiquement selon le format choisi.
- Nettoyage/sanitation des noms de fichiers (suppression des caractères interdits).
- Interface en français avec documentation intégrée et astuces d'usage.
- Boutons d'action activés/désactivés automatiquement selon l'état de la sélection.

### Statistiques & suivi
- Affichage par image : poids original, poids converti, dimensions originales, nouvelles dimensions.
- Récapitulatif global dynamique :
  - poids original total,
  - poids converti total,
  - pourcentage de gain (ou surcoût).

## Améliorations apportées

- **Chargement 100 % local des assets** (`styles.css` et `app.js`) via `index.html` pour éviter les dépendances externes.
- **Compatibilité renforcée en environnement proxy/restrictif** grâce à l'absence de CDN tiers.
- **Pipeline de conversion enrichi** : combinaison recadrage + redimensionnement + suppression de fond + conversion de format.
- **Gestion plus robuste des entrées utilisateur** : validation des dimensions, couleurs et noms de fichiers.
- **Expérience utilisateur améliorée** : documentation embarquée, feedback visuel des réglages, actions globales simplifiées.

## Démarrage

### Exécution locale simple
Ouvrez directement `index.html` dans un navigateur moderne.

### Exécution via serveur statique
```bash
python -m http.server 8000
```
Puis accédez à `http://localhost:8000`.

## Déploiement avec Docker

1. Construire et lancer le service :
   ```bash
   docker compose up --build
   ```
2. Ouvrir l'application sur `http://localhost:8001`.

Le serveur HTTP interne écoute sur le port `8001` (voir `Dockerfile` et `docker-compose.yml`).
