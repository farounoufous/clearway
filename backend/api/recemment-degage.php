<?php
header("Access-Control-Allow-Origin: https://clearway-phi.vercel.app"); // ⚠️ REMPLACEZ par votre vraie URL Vercel
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Credentials: true");

// Si c'est une requête de pré-vérification (OPTIONS), on arrête le script immédiatement
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}

    

// ============================================
// ClearWay Bénin - API Récemment dégagé
// Liste les signalements archivés via 3 confirmations "voie dégagée"
// dans les dernières 24h (pour montrer que le système fonctionne vraiment)
// ============================================

header('Content-Type: application/json; charset=utf-8');
require_once dirname(__DIR__) . '/config/db.php';

$sql = "
    SELECT s.id, s.type_obstacle, s.gravite, s.date_archivage,
           s.latitude, s.longitude, s.pays, s.ville, s.quartier,
           (SELECT COUNT(DISTINCT COALESCE(visiteur_id, ip_utilisateur))
              FROM confirmations c
             WHERE c.signalement_id = s.id AND c.type_confirmation = 'voie_degagee') AS nb_degagees
    FROM signalements s
    WHERE s.statut = 'archive'
      AND s.date_archivage IS NOT NULL
      AND s.date_archivage >= (NOW() - INTERVAL 24 HOUR)
    HAVING nb_degagees >= 3
    ORDER BY s.date_archivage DESC
    LIMIT 20
";
$rows = $pdo->query($sql)->fetchAll();

// Libellé de secours : quartier > ville > pays > coordonnées brutes
function libelleZone($s) {
    if (!empty($s['quartier'])) return $s['quartier'];
    if (!empty($s['ville'])) return $s['ville'];
    if (!empty($s['pays'])) return $s['pays'];
    if ($s['latitude'] !== null && $s['longitude'] !== null) {
        return 'Position (' . round((float) $s['latitude'], 4) . ', ' . round((float) $s['longitude'], 4) . ')';
    }
    return 'Localisation inconnue';
}

function graviteLabel($gravite) {
    return match ($gravite) {
        'Severe' => 'sévère',
        'Modere' => 'modéré',
        'Praticable' => 'léger',
        default => 'léger',
    };
}

function ilYA($date) {
    $minutes = max(0, floor((time() - strtotime($date)) / 60));
    if ($minutes < 1) return "à l'instant";
    if ($minutes < 60) return "il y a {$minutes} min";
    $heures = floor($minutes / 60);
    return "il y a {$heures}h";
}

$resultats = array_map(function ($s) {
    return [
        'id' => (int) $s['id'],
        'zone' => libelleZone($s),
        'type_obstacle' => $s['type_obstacle'],
        'gravite_label' => graviteLabel($s['gravite']),
        'nb_degagees' => (int) $s['nb_degagees'],
        'il_y_a' => ilYA($s['date_archivage']),
        'latitude' => $s['latitude'] !== null ? (float) $s['latitude'] : null,
        'longitude' => $s['longitude'] !== null ? (float) $s['longitude'] : null,
    ];
}, $rows);

echo json_encode($resultats);