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
    ip_createur VARCHAR(45) NULL,
    statut ENUM('actif', 'incertain', 'archive') NOT NULL DEFAULT 'actif',
    valide TINYINT(1) NOT NULL DEFAULT 0,
    date_creation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    derniere_confirmation DATETIME NULL,
    date_archivage DATETIME NULL
) ENGINE=InnoDB;

-- Table 2 : confirmations (confirmation collaborative en 1 clic)
CREATE TABLE IF NOT EXISTS confirmations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    signalement_id INT NOT NULL,
    type_confirmation ENUM('toujours_bloquee', 'voie_degagee', 'signalement_errone') NOT NULL,
    ip_utilisateur VARCHAR(45) NULL,
    visiteur_id VARCHAR(64) NULL,
    date_confirmation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (signalement_id) REFERENCES signalements(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Table 3 : push_subscriptions (notifications)
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    endpoint TEXT NOT NULL,
    p256dh VARCHAR(255) NOT NULL,
    auth_secret VARCHAR(255) NOT NULL,
    latitude DECIMAL(10,7) NULL,
    longitude DECIMAL(10,7) NULL,
    date_creation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY endpoint_unique (endpoint(255))
) ENGINE=InnoDB;

-- Index utiles pour les requêtes fréquentes
CREATE INDEX idx_signalements_statut ON signalements(statut);
CREATE INDEX idx_signalements_valide ON signalements(valide);
CREATE INDEX idx_signalements_gravite ON signalements(gravite);
CREATE INDEX idx_confirmations_signalement ON confirmations(signalement_id);