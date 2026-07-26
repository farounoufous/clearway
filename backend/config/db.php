<?php
// backend/config/db.php
date_default_timezone_set('Africa/Porto-Novo');

// En-têtes CORS corrigés ici aussi pour plus de sécurité
header("Access-Control-Allow-Origin: https://clearway-phi.vercel.app");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Credentials: true");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') { exit(0); }

function ouvrirConnexion($host, $nom, $utilisateur, $motDePasse, $port = 3306) {
    return new PDO(
        "mysql:host=$host;dbname=$nom;port=$port;charset=utf8mb4",
        $utilisateur,
        $motDePasse,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT => 3,
        ]
    );
}

$pdo = null;
try {
    // ---- Essai 1 : Votre environnement local XAMPP ----
    $pdo = ouvrirConnexion('localhost', 'clearway_benin', 'root', '');
} catch (\Throwable $e) {
    try {
        // ---- Essai 2 : Production via les variables existantes ----
        $host = getenv('RAILWAY_PUBLIC_DOMAIN');
        $database = getenv('RAILWAY_PROJECT_NAME');
        $user = 'root'; // Utilisateur par défaut de Railway
        $password = 'zRNupuCprSSUXMjLaHlWeqiGGdCIrSuW'; // Votre mot de passe secret
        $port = 3306;
        
        if (!$host) {
            throw new \Exception("La variable RAILWAY_PUBLIC_DOMAIN est introuvable sur Vercel.");
        }
        
        $pdo = ouvrirConnexion($host, $database, $user, $password, $port);
        
    } catch (\Throwable $e_railway) {
        http_response_code(200); 
        header('Content-Type: application/json; charset=utf-8');
        die(json_encode([
            'nb_bloquees' => 0,
            'nb_actifs' => 0,
            'derniers_signalements' => [],
            'erreur_base' => 'Impossible de se connecter à la base Railway : ' . $e_railway->getMessage()
        ]));
    }
}

    



// Aligne aussi l'horloge MySQL sur le Bénin (GMT+1)
try {
    $pdo->exec("SET time_zone = '+01:00'");
} catch (\Throwable $e) {
    error_log('Réglage fuseau horaire MySQL impossible : ' . $e->getMessage());
}

// ============================================
// Auto-réparation du schéma (Le reste de votre code d'origine)
// ============================================
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
