<?php
header("Access-Control-Allow-Origin: https://clearway-phi.vercel.app"); 
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Credentials: true");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}

header('Content-Type: application/json; charset=utf-8');
require_once dirname(__DIR__) . '/config/db.php';

$methode = $_SERVER['REQUEST_METHOD'];

if ($methode === 'POST') {
    $donnees = json_decode(file_get_contents('php://input'), true);

    $endpoint = $donnees['endpoint'] ?? null;
    $p256dh = $donnees['keys']['p256dh'] ?? null;
    $auth = $donnees['keys']['auth'] ?? null;

    if (empty($endpoint) || empty($p256dh) || empty($auth)) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Abonnement incomplet.']);
        exit;
    }

    // Position de l'abonné au moment de l'activation des alertes push.
    $latitude = filter_var($donnees['latitude'] ?? null, FILTER_VALIDATE_FLOAT);
    $longitude = filter_var($donnees['longitude'] ?? null, FILTER_VALIDATE_FLOAT);

    if ($latitude === false || $latitude < -90 || $latitude > 90) {
        $latitude = null;
    }
    if ($longitude === false || $longitude < -180 || $longitude > 180) {
        $longitude = null;
    }

    $stmt = $pdo->prepare("
        INSERT INTO push_subscriptions (endpoint, p256dh, auth_secret, latitude, longitude, date_creation)
        VALUES (?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth_secret = VALUES(auth_secret),
                                 latitude = VALUES(latitude), longitude = VALUES(longitude)
    ");
    $stmt->execute([$endpoint, $p256dh, $auth, $latitude, $longitude]);

    echo json_encode(['succes' => true]);
    exit;
}

if ($methode === 'DELETE') {
    $donnees = json_decode(file_get_contents('php://input'), true);
    $endpoint = $donnees['endpoint'] ?? null;

    if (empty($endpoint)) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Endpoint manquant.']);
        exit;
    }

    $stmt = $pdo->prepare("DELETE FROM push_subscriptions WHERE endpoint = ?");
    $stmt->execute([$endpoint]);

    echo json_encode(['succes' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['erreur' => 'Méthode non autorisée.']);