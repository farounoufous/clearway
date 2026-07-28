<?php
function ouvrirConnexion($host, $nom, $utilisateur, $motDePasse) {
    return new PDO(
        "mysql:host=$host;dbname=$nom;charset=utf8mb4",
        $utilisateur,
        $motDePasse,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT => 3,
        ]
    );
}

try {
    // ---- Essai 1 : config locale (XAMPP) ----
    $pdo = ouvrirConnexion('localhost', 'clearway_benin', 'root', '');
} catch (\Throwable $e) {
    try {
        // ---- Essai 2 : config en ligne (à compléter avec tes identifiants d'hébergement) ----
        $pdo = ouvrirConnexion('TON_HOTE_MYSQL', 'TON_NOM_DE_BASE', 'TON_UTILISATEUR', 'TON_MOT_DE_PASSE');
    } catch (\Throwable $e2) {
        http_response_code(500);
        header('Content-Type: application/json');
        die(json_encode(['erreur' => 'Connexion base de données impossible : ' . $e2->getMessage()]));
    }
}
try {
    $colonneExiste = $pdo->query("SHOW COLUMNS FROM confirmations LIKE 'visiteur_id'")->fetch();
    if (!$colonneExiste) {
        $pdo->exec("ALTER TABLE confirmations ADD COLUMN visiteur_id VARCHAR(64) NULL AFTER ip_utilisateur");
    }
} catch (\Throwable $e) {
    error_log('Auto-réparation schéma (visiteur_id) impossible : ' . $e->getMessage());
}

try {
    $tableExiste = $pdo->query("SHOW TABLES LIKE 'push_subscriptions'")->fetch();
    if (!$tableExiste) {
        $pdo->exec("
            CREATE TABLE push_subscriptions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                endpoint TEXT NOT NULL,
                p256dh VARCHAR(255) NOT NULL,
                auth_secret VARCHAR(255) NOT NULL,
                date_creation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY endpoint_unique (endpoint(255))
            ) ENGINE=InnoDB
        ");
    }
} catch (\Throwable $e) {
    error_log('Auto-réparation schéma (push_subscriptions) impossible : ' . $e->getMessage());
}

// ---- Migration : suppression de l'ancien système de zones ----
// (le formulaire n'utilise plus qu'un point GPS/carte comme localisation)
try {
    $colonneExiste = $pdo->query("SHOW COLUMNS FROM signalements LIKE 'zone_id'")->fetch();
    if ($colonneExiste) {
        $contrainte = $pdo->query("
            SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'signalements'
              AND COLUMN_NAME = 'zone_id' AND REFERENCED_TABLE_NAME = 'zones'
            LIMIT 1
        ")->fetch();
        if ($contrainte) {
            $pdo->exec("ALTER TABLE signalements DROP FOREIGN KEY `{$contrainte['CONSTRAINT_NAME']}`");
        }
        $pdo->exec("ALTER TABLE signalements DROP COLUMN zone_id");
    }
} catch (\Throwable $e) {
    error_log('Auto-réparation schéma (suppression zone_id) impossible : ' . $e->getMessage());
}

try {
    $pdo->exec("DROP TABLE IF EXISTS zones");
} catch (\Throwable $e) {
    error_log('Auto-réparation schéma (suppression table zones) impossible : ' . $e->getMessage());
}

// ---- Nouvelles colonnes de localisation détaillée (géocodage inversé) ----
try {
    $colonnesLocalisation = [
        'accuracy'         => "DECIMAL(8,2) NULL",
        'source_position'  => "ENUM('GPS','CARTE') NULL",
        'pays'             => "VARCHAR(100) NULL",
        'ville'            => "VARCHAR(100) NULL",
        'quartier'         => "VARCHAR(150) NULL",
        'adresse_formatee' => "VARCHAR(255) NULL",
    ];
    foreach ($colonnesLocalisation as $colonne => $definition) {
        $existe = $pdo->query("SHOW COLUMNS FROM signalements LIKE '$colonne'")->fetch();
        if (!$existe) {
            $pdo->exec("ALTER TABLE signalements ADD COLUMN `$colonne` $definition");
        }
    }
} catch (\Throwable $e) {
    error_log('Auto-réparation schéma (localisation détaillée) impossible : ' . $e->getMessage());
}

try {
    $colonneExiste = $pdo->query("SHOW COLUMNS FROM signalements LIKE 'latitude'")->fetch();
    if (!$colonneExiste) {
        $pdo->exec("ALTER TABLE signalements ADD COLUMN latitude DECIMAL(10,7) NULL AFTER description");
        $pdo->exec("ALTER TABLE signalements ADD COLUMN longitude DECIMAL(10,7) NULL AFTER latitude");
    }
} catch (\Throwable $e) {
    error_log('Auto-réparation schéma (géolocalisation signalements) impossible : ' . $e->getMessage());
}

try {
    $colonneExiste = $pdo->query("SHOW COLUMNS FROM signalements LIKE 'valide'")->fetch();
    if (!$colonneExiste) {
        $pdo->exec("ALTER TABLE signalements ADD COLUMN valide TINYINT(1) NOT NULL DEFAULT 0 AFTER statut");
        $pdo->exec("CREATE INDEX idx_signalements_valide ON signalements(valide)");
    }
} catch (\Throwable $e) {
    error_log('Auto-réparation schéma (valide) impossible : ' . $e->getMessage());
}
