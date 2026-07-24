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
// ClearWay Bénin - API Mes signalements
// Pas de compte utilisateur : le navigateur mémorise localement les IDs
// des signalements qu'il a créés, et les envoie ici pour en récupérer le détail.
// GET ?ids=12,15,23
// ============================================

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/db.php';

$idsBruts = $_GET['ids'] ?? '';
$ids = array_values(array_unique(array_filter(array_map('intval', explode(',', $idsBruts)))));

if (empty($ids)) {
    echo json_encode([]);
    exit;
}

// Limite raisonnable pour éviter un appel excessif si le stockage local a grossi
$ids = array_slice($ids, 0, 100);

$placeholders = implode(',', array_fill(0, count($ids), '?'));

$sql = "
    SELECT s.id, s.type_obstacle, s.gravite, s.statut, s.valide, s.date_creation, s.derniere_confirmation, s.photo,
           s.latitude, s.longitude, s.pays, s.ville, s.quartier, s.adresse_formatee,
           (SELECT COUNT(DISTINCT COALESCE(visiteur_id, ip_utilisateur)) FROM confirmations c WHERE c.signalement_id = s.id AND c.type_confirmation = 'toujours_bloquee') AS nb_confirmations
    FROM signalements s
    WHERE s.id IN ($placeholders) AND s.statut = 'actif'
    ORDER BY s.date_creation DESC
";
$stmt = $pdo->prepare($sql);
$stmt->execute($ids);
$rows = $stmt->fetchAll();

function graviteClasse($gravite) {
    return match ($gravite) {
        'Severe' => 'severe',
        'Modere' => 'modere',
        default => 'praticable',
    };
}

function graviteLabel($gravite) {
    return match ($gravite) {
        'Severe' => 'sévère',
        'Modere' => 'modéré',
        'Praticable' => 'Praticable',
        default => 'léger',
    };
}

function dateLisible($date) {
    return date('d/m/Y à H\hi', strtotime($date));
}

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

$resultats = array_map(function ($s) {
    return [
        'id' => (int) $s['id'],
        'zone' => libelleZone($s),
        'adresse_complete' => $s['adresse_formatee'],
        'type_obstacle' => $s['type_obstacle'],
        'gravite_classe' => graviteClasse($s['gravite']),
        'gravite_label' => graviteLabel($s['gravite']),
        'statut' => $s['statut'],
        'valide' => (bool) $s['valide'],
        'nb_confirmations' => (int) $s['nb_confirmations'],
        'date_creation' => dateLisible($s['date_creation']),
        'photo' => $s['photo'] ? '../backend/uploads/' . $s['photo'] : null,
        'lien_maps' => ($s['latitude'] !== null && $s['longitude'] !== null)
            ? "https://www.google.com/maps?q={$s['latitude']},{$s['longitude']}"
            : null,
    ];
}, $rows);

echo json_encode($resultats);
