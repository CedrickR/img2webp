# img2webp

Application web statique pour convertir rapidement des images JPG/PNG en WebP tout en ajustant la compression et la réduction de taille.

## Fonctionnalités

- Import multiple d'images (glisser-déposer ou sélection de fichiers).
- Ajustement individuel du taux de compression WebP via un curseur.
- Réduction en pourcentage via un curseur dédié avec calcul automatique des nouvelles dimensions.
- Affichage du poids original et estimé après conversion.
- Téléchargement de chaque image convertie ou de l'ensemble en archive ZIP.
- Champ de renommage pour définir le nom des fichiers WebP avant téléchargement.
- Récapitulatif dynamique des poids cumulés et du pourcentage de gain total.
- Suppression d'une image à la volée depuis sa vignette.
- Espace de documentation intégré détaillant le flux d'utilisation et les bonnes pratiques.

## Démarrage

Ouvrez simplement `index.html` dans un navigateur moderne ou servez le dossier avec `python -m http.server 8000` puis accédez à `http://localhost:8000`.

## Déploiement avec Docker

1. Construire et lancer le service :
   ```bash
   docker compose up --build
   ```
2. Ouvrir l'application sur `http://localhost:8001`.

Le serveur HTTP interne écoute sur le port `8001`, conformément à la configuration du `Dockerfile` et du `docker-compose.yml`.

## Documentation intégrée

Un encart « Documentation & utilisation » sur la page principale rappelle les étapes clés (import, réglages, téléchargements) et fournit une astuce sur les niveaux de compression pour guider les utilisateurs.
