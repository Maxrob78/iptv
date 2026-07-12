# 📺 Guide d'Installation Platinum Media Center sur Samsung The Frame

Ce guide contient les étapes finales pour transformer ce projet en application native Tizen (`.wgt`) et l'installer sur votre téléviseur.

## 1. Pré-requis sur votre PC
1. **Tizen Studio** : Téléchargez et installez "Tizen Studio with IDE" sur le site Samsung Developers.
2. **Extensions** : Dans le `Package Manager` de Tizen Studio, installez :
   - `Tizen SDK Tools`
   - `Samsung Certificate Extension`
   - `TV Extension Tools`

## 2. Génération des fichiers (Build)
Exécutez cette commande à la racine du projet pour générer les fichiers optimisés :
```bash
npm run build
```
Les fichiers seront générés dans le dossier `out/`.

## 3. Signature de l'application (Certificats)
Samsung n'autorise que les applications signées.
1. Ouvrez **Tizen Studio**.
2. Allez dans **Tools > Certificate Manager**.
3. Cliquez sur **+** et choisissez **Samsung**.
4. Suivez les étapes pour créer un certificat "Author" et un certificat "Distributor" (gratuit avec un compte Samsung).

## 4. Création du package .wgt
Une fois le build fait et les certificats créés, lancez cette commande dans votre terminal :
```bash
tizen package -t wgt -s <NOM_DE_VOTRE_PROFIL> -- ./out
```
*(Remplacez `<NOM_DE_VOTRE_PROFIL>` par le nom que vous avez donné à votre certificat).*

## 5. Connexion à la télé (The Frame)
1. Allumez votre téléviseur.
2. Allez dans le **Apps Store**.
3. Sur la télécommande, tapez successivement : `1` `2` `3` `4` `5`.
4. Le menu **Developer Mode** s'affiche :
   - Mettez `Developer Mode` sur **ON**.
   - Entrez l'adresse IP de votre PC.
5. Éteignez et rallumez la télé (maintenir le bouton Power).

## 6. Installation finale
Ouvrez le **Device Manager** de Tizen Studio sur votre PC :
1. Cliquez sur l'icône "Remote Device Manager" (en haut à droite).
2. Ajoutez votre télé (elle devrait apparaître si elle est sur le même Wi-Fi).
3. Une fois connectée, faites un clic droit sur le fichier `.wgt` généré précédemment et choisissez **Run As > Tizen Web Application**.

---

### 🚀 Félicitations !
L'application apparaîtra dans la liste de vos applications sur votre Samsung The Frame. Elle est configurée pour utiliser le moteur natif AVPlay et la navigation spatiale par télécommande.
