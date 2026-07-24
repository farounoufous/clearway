-- ============================================
-- ClearWay Bénin - Base de données (schéma consolidé)
--
-- Fichier unique : plus de table `zones` / sélecteur "Zone/Quartier". La
-- localisation d'un signalement vient uniquement de :
--   - la géolocalisation du navigateur ("Utiliser ma position"), ou
--   - un point choisi sur la carte Leaflet/OpenStreetMap ("Choisir sur la carte")
-- Le pays/ville/quartier/adresse sont ensuite déduits par géocodage inversé
-- (Nominatim) côté client, et enregistrés à titre indicatif : la donnée de
-- référence reste latitude/longitude.
--
-- Portable par défaut (pas de CREATE DATABASE / USE, interdits sur les
-- hébergements mutualisés type InfinityFree où la base est déjà créée depuis
-- le panneau de contrôle). En local (XAMPP...), crée d'abord la base :
--
--   CREATE DATABASE IF NOT EXISTS clearway_benin
--     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--   USE clearway_benin;
--
-- Note : backend/config/db.php sait aussi mettre à jour tout seul le schéma
-- d'une base déjà existante (auto-réparation, y compris suppression de
-- l'ancienne table zones) : ce fichier sert surtout pour une toute première
-- installation.
-- ============================================

-- ============================================
-- Table 1 : signalements (le coeur du système)
--
-- Règle "voie dégagée" : il faut 3 confirmations "voie_degagee" de 3
-- VISITEURS DIFFÉRENTS avant que le signalement puisse être archivé
-- (retiré de la liste des voies bloquées), via un clic explicite.
--
-- Règle "validation communautaire" : dès que 3 VISITEURS DIFFÉRENTS ont
-- confirmé "toujours_bloquee", `valide` passe à 1. Un signalement validé
-- n'est plus jamais archivé automatiquement après 3h : il ne disparaît que
-- si la communauté le confirme "dégagé".
--
-- Localisation : latitude/longitude sont la donnée de référence (obligatoire
-- en pratique, imposé côté API). pays/ville/quartier/adresse_formatee sont
-- déduits par géocodage inversé et purement indicatifs pour l'affichage ;
-- ils peuvent être NULL si le géocodage échoue ou si l'utilisateur n'a pas
-- complété le quartier manquant.
-- ============================================
CREATE TABLE IF NOT EXISTS signalements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type_obstacle ENUM('Inondation', 'Accident', 'Travaux', 'Autre') NOT NULL,
    gravite ENUM('Leger', 'Modere', 'Severe', 'Praticable') NOT NULL,
    description TEXT NULL,
    latitude DECIMAL(10,7) NULL,
    longitude DECIMAL(10,7) NULL,
    accuracy DECIMAL(8,2) NULL,
    source_position ENUM('GPS', 'CARTE') NULL,
    pays VARCHAR(100) NULL,
    ville VARCHAR(100) NULL,
    quartier VARCHAR(150) NULL,
    adresse_formatee VARCHAR(255) NULL,
    photo VARCHAR(255) NULL,
    statut ENUM('actif', 'archive') NOT NULL DEFAULT 'actif',
    valide TINYINT(1) NOT NULL DEFAULT 0,
    date_creation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    derniere_confirmation DATETIME NULL,
    date_archivage DATETIME NULL
) ENGINE=InnoDB;

-- ============================================
-- Table 2 : confirmations (confirmation collaborative en 1 clic)
--
-- visiteur_id : identifiant anonyme généré par le navigateur (et non l'IP),
-- pour reconnaître de façon fiable des visiteurs distincts. ip_utilisateur
-- est conservé comme repli pour d'anciennes lignes créées avant l'ajout de
-- visiteur_id (voir COALESCE(visiteur_id, ip_utilisateur) dans les requêtes).
-- ============================================
CREATE TABLE IF NOT EXISTS confirmations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    signalement_id INT NOT NULL,
    type_confirmation ENUM('toujours_bloquee', 'voie_degagee') NOT NULL,
    ip_utilisateur VARCHAR(45) NULL,
    visiteur_id VARCHAR(64) NULL,
    date_confirmation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (signalement_id) REFERENCES signalements(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================
-- Table 3 : push_subscriptions (notifications)
-- Un abonnement par navigateur/appareil ayant accepté les notifications
-- ============================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    endpoint TEXT NOT NULL,
    p256dh VARCHAR(255) NOT NULL,
    auth_secret VARCHAR(255) NOT NULL,
    date_creation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY endpoint_unique (endpoint(255))
) ENGINE=InnoDB;

-- ============================================
-- Index utiles pour les requêtes fréquentes
-- ============================================
CREATE INDEX idx_signalements_statut ON signalements(statut);
CREATE INDEX idx_signalements_valide ON signalements(valide);
CREATE INDEX idx_signalements_gravite ON signalements(gravite);
CREATE INDEX idx_confirmations_signalement ON confirmations(signalement_id);
