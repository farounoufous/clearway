<?php
date_default_timezone_set('Africa/Porto-Novo');

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
    // ---- Essai 1 : local XAMPP ----
    $pdo = ouvrirConnexion('localhost', 'clearway_benin', 'root', '');
} catch (\Throwable $e) {
    try {
        // ---- Essai 2 : Production Railway ----
        $host = getenv('MYSQLHOST');

        if (!$host) {
            throw new \Exception("Les variables d'environnement Railway (MYSQLHOST, etc.) ne sont pas détectées.");
        }

        $pdo = ouvrirConnexion(
            $host,
            getenv('MYSQLDATABASE'),
            getenv('MYSQLUSER'),
            getenv('MYSQLPASSWORD'),
            getenv('MYSQLPORT') ?: 3306
        );
    } catch (\Throwable $e_railway) {
        // En cas d'échec total (local et production), on renvoie une erreur JSON propre
        // avec un VRAI code d'erreur HTTP (500) : les en-têtes CORS sont déjà envoyés
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        die(json_encode([
            'succes' => false,
            'nb_bloquees' => 0,
            'nb_actifs' => 0,
            'derniers_signalements' => [],
            'erreur' => 'Impossible de se connecter à la base Railway : ' . $e_railway->getMessage(),
            'erreur_base' => 'Impossible de se connecter à la base Railway : ' . $e_railway->getMessage()
        ]));
    }
}

try {
    $pdo->exec("SET time_zone = '+01:00'");
} catch (\Throwable $e) {
    error_log('Réglage fuseau horaire MySQL impossible : ' . $e->getMessage());
}

try {
    $schemaDejaAJour = (bool) $pdo->query("SHOW COLUMNS FROM signalements LIKE 'valide'")->fetch();
} catch (\Throwable $e) {
    $schemaDejaAJour = false;
}

if (!$schemaDejaAJour) {
try {
    $colonneExiste = $pdo->query("SHOW COLUMNS FROM signalements LIKE 'zone_id'")->fetch();
    if ($colonneExiste) {
        $contrainte = $pdo->query("
            SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'signalements'
              AND COLUMN_NAME = 'zone_id' AND REFERENCED_TABLE_NAME = 'zones'
            LIMIT 1
        ")->fetch();

        if ($contrainte && isset($contrainte['CONSTRAINT_NAME'])) {
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

} 
try {
    $colonneExiste = $pdo->query("SHOW COLUMNS FROM push_subscriptions LIKE 'latitude'")->fetch();
    if (!$colonneExiste) {
        $pdo->exec("ALTER TABLE push_subscriptions ADD COLUMN latitude DECIMAL(10,7) NULL AFTER auth_secret");
        $pdo->exec("ALTER TABLE push_subscriptions ADD COLUMN longitude DECIMAL(10,7) NULL AFTER latitude");
    }
} catch (\Throwable $e) {
    error_log('Auto-réparation schéma (géolocalisation push_subscriptions) impossible : ' . $e->getMessage());
}