# AI Story Weaver

Je veux transformer mon application Storybook en une plateforme de création automatique de livres avec IA.

OBJECTIF PRINCIPAL

L'utilisateur doit pouvoir importer ou coller un texte très long (par exemple 10, 50, 100, 300 pages ou davantage), puis cliquer sur « Générer le livre ».

L'application doit automatiquement transformer ce texte en un livre numérique complet avec :

titre

résumé

chapitres

pages

illustrations pour les pages

personnages cohérents visuellement

couverture avant

couverture arrière

narration audio de chaque page

lecteur de livre

progression de génération

sauvegarde dans la base de données

possibilité de reprendre une génération interrompue

possibilité de régénérer une page, une image ou un audio sans refaire tout le livre.

IMPORTANT : l'application doit être conçue pour les livres longs. Ne jamais envoyer tout un livre dans une seule requête de génération. Utiliser un système de jobs/tâches et générer le contenu par étapes et par lots.

ARCHITECTURE

Frontend :

conserver l'architecture actuelle de Storybook

interface moderne et professionnelle

responsive

utiliser les composants existants lorsqu'ils sont compatibles.

Backend :

toutes les clés API doivent rester côté serveur

créer des API sécurisées pour les différentes étapes de génération

ne jamais exposer les clés API dans le frontend.

BASE DE DONNÉES

Utiliser Supabase si le projet utilise déjà Supabase.

Créer ou adapter les tables suivantes :

books :

id

user_id

title

description

language

style

status

total_pages

cover_front_url

cover_back_url

created_at

updated_at

chapters :

id

book_id

title

chapter_number

summary

pages :

id

book_id

chapter_id

page_number

text

image_prompt

image_url

audio_url

status

created_at

updated_at

characters :

id

book_id

name

age

description

appearance

personality

reference_image_url

generation_jobs :

id

book_id

type

status

progress

current_item

total_items

error

created_at

updated_at

STOCKAGE

Utiliser Supabase Storage pour les fichiers générés.

Créer une organisation claire :

books/{bookId}/cover/
books/{bookId}/pages/
books/{bookId}/audio/
books/{bookId}/characters/

NE PAS stocker les images ou fichiers audio directement dans PostgreSQL.
La base de données doit uniquement conserver les URLs/références.

PROCESSUS DE GÉNÉRATION

Étape 1 — Analyse du texte

L'utilisateur fournit son histoire.

L'IA doit analyser le texte et produire une structure JSON stricte contenant :

titre

résumé

genre

style

personnages

lieux importants

chapitres

informations nécessaires pour maintenir la cohérence de l'histoire.

Créer une Character Bible.

Exemple :

{
"name": "Adam",
"age": 12,
"appearance": "short black hair, brown eyes, blue jacket",
"personality": "curious and kind"
}

Cette description doit être réutilisée pour les illustrations suivantes.

Étape 2 — Découpage en pages

Transformer le texte en pages adaptées à la lecture.

Chaque page doit contenir :

numéro

chapitre

texte

description de la scène

imagePrompt

audioText

Ne pas générer toutes les images immédiatement dans la même requête.

Étape 3 — Illustrations

Pour chaque page :

texte de la page
→ analyse de la scène
→ génération du prompt
→ génération de l'image
→ sauvegarde dans Supabase Storage
→ sauvegarde de image_url dans la table pages.

Le prompt d'image doit tenir compte :

des personnages présents

de leur apparence définie dans Character Bible

du lieu

de l'époque

de l'ambiance

de la scène décrite

du style graphique choisi.

Les personnages doivent rester visuellement cohérents autant que possible entre les pages.

Étape 4 — Couverture avant

Créer automatiquement une couverture à partir :

du titre

du résumé

du personnage principal

du genre

du style graphique

des éléments principaux de l'histoire.

La couverture doit être enregistrée dans :

books/{bookId}/cover/front

Étape 5 — Couverture arrière

Créer automatiquement une couverture arrière avec une illustration adaptée et le résumé du livre.

Enregistrer dans :

books/{bookId}/cover/back

Étape 6 — Audio

Pour chaque page :

page.text
→ Text-to-Speech
→ fichier audio
→ Supabase Storage
→ audio_url dans pages.

L'utilisateur doit pouvoir écouter l'audio directement dans le lecteur.

LECTEUR

Créer un lecteur de livre professionnel :

couverture

page actuelle

illustration

texte

bouton Play/Pause

audio de la page

page précédente

page suivante

numéro de page

barre de progression

liste des chapitres.

Exemple :

PAGE 12 / 100

[ Illustration ]

Texte de la page...

▶ Écouter

< Précédente Suivante >

GÉNÉRATION DES LIVRES LONGS

C'est une exigence très importante.

Pour un livre de 300 pages, ne pas faire une seule requête qui attend la fin de toute la génération.

Créer un système de jobs.

Exemple :

Book
↓
Analysis Job
↓
Page Generation Job
↓
Image Generation Jobs
↓
Audio Generation Jobs
↓
Cover Generation
↓
Completed

Afficher la progression :

Analyse du livre ✅
Création des personnages ✅
Création des pages ✅
Illustrations 72%
Audio 35%
Couverture ⏳

Si une génération échoue sur la page 173, l'utilisateur doit pouvoir relancer uniquement la page 173.

Ne jamais recommencer tout le livre.

Chaque étape doit sauvegarder son résultat avant de passer à la suivante.

STATUTS

Utiliser des statuts clairs :

pending
processing
completed
failed

Pour les pages :

pending
generating_image
image_completed
generating_audio
completed
failed

GESTION DES ERREURS

Si une image échoue :

conserver le texte de la page

afficher une erreur sur cette page

permettre « Régénérer l'image ».

Si l'audio échoue :

conserver l'image et le texte

permettre « Régénérer l'audio ».

Si une page échoue, les autres pages doivent continuer leur génération.

INTERFACE DE CRÉATION

Ajouter un bouton :

« ✨ Créer un livre avec l'IA »

Interface :

Titre facultatif
Texte / Importer un fichier
Langue
Style d'illustration
Style de narration
Nombre approximatif de pages
Générer audio : Oui/Non

Puis :

« ✨ Générer mon livre »

IMPORTANT POUR LES FICHIERS

Permettre au minimum :

.txt
.docx
.pdf

Si l'import PDF/DOCX est trop complexe dans la première version, créer d'abord une version fonctionnelle avec texte collé directement, puis ajouter les imports.

API ET FOURNISSEURS IA

Ne pas inventer de services ou de clés API.

Avant d'implémenter les appels externes, vérifier quels fournisseurs sont déjà disponibles dans le projet.

Prévoir une architecture permettant de remplacer facilement :

modèle IA texte

modèle de génération d'images

fournisseur Text-to-Speech.

Créer une couche d'abstraction :

textProvider
imageProvider
audioProvider

Ainsi, je pourrai changer de fournisseur plus tard sans réécrire toute l'application.

IMPORTANT

Ne pas mettre de clé API dans le code frontend.

Utiliser les variables d'environnement.

Créer un fichier .env.example contenant uniquement les noms des variables nécessaires, sans vraies clés.

QUALITÉ

Je veux du vrai code fonctionnel, pas uniquement des écrans de démonstration.

Ne pas utiliser de faux boutons qui ne font rien.

Ne pas simuler une génération avec des pourcentages artificiels.

Chaque progression doit correspondre à une vraie tâche.

Avant de modifier l'application, inspecter toute l'architecture existante de Storybook et réutiliser ce qui existe déjà.

Ne pas supprimer les fonctionnalités actuelles de Storybook.

Construire cette fonctionnalité progressivement et conserver la compatibilité avec l'application existante.

À LA FIN

Je dois pouvoir faire :

Coller une longue histoire.

Cliquer sur « Générer mon livre ».

L'IA analyse l'histoire.

L'IA crée les personnages.

L'IA découpe le livre en chapitres et pages.

Une illustration est générée pour chaque page.

Une couverture avant et arrière sont générées.

Un audio est généré pour chaque page.

Tout est sauvegardé.

Le livre apparaît automatiquement dans Storybook.

Je peux le lire page par page.

Je peux écouter chaque page.

Je peux régénérer uniquement une image ou un audio.

Une interruption ne doit pas obliger à recommencer le livre entier.

Commence par inspecter le projet existant avant de modifier les fichiers. Identifie les fichiers concernés et implémente cette fonctionnalité en conservant l'architecture actuelle.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://tale-weaver-50.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b9c1c4dd-884e-42b8-90ae-0d0ca014b1b8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
