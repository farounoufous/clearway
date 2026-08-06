<?php
header("Access-Control-Allow-Origin: https://clearway-phi.vercel.app");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Credentials: true");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}

$origineBackend = (($_SERVER['HTTPS'] ?? 'off') !== 'off' ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'];

header('Content-Type: application/json; charset=utf-8');
require_once dirname(__DIR__) . '/config/db.php';

$idsBruts = $_GET['ids'] ?? '';
$ids = array_values(array_unique(array_filter(array_map('intval', explode(',', $idsBruts)))));

if (empty($ids)) {
    echo json_encode([]);
    exit;
}

$ids = array_slice($ids, 0, 100);

$placeholders = implode(',', array_fill(0, count($ids), '?'));

$sql = "
    SELECT s.id, s.type_obstacle, s.gravite, s.statut, s.valide, s.date_creation, s.derniere_confirmation, s.photo,
           s.latitude, s.longitude, s.pays, s.ville, s.quartier, s.adresse_formatee,
           (SELECT COUNT(DISTINCT COALESCE(visiteur_id, ip_utilisateur)) FROM confirmations c WHERE c.signalement_id = s.id AND c.type_confirmation = 'toujours_bloquee') AS nb_confirmations
    FROM signalements s
    WHERE s.id IN ($placeholders) AND s.statut IN ('actif', 'incertain')
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

function confiance($s) {
    if ((bool) $s['valide']) return 'validee';
    if ((int) $s['nb_confirmations'] > 0) return 'confirmee_partiellement';
    if ($s['statut'] === 'incertain') return 'incertain';
    return 'recente';
}

function libelleZone($s) {
    if (!empty($s['quartier'])) return $s['quartier'];
    if (!empty($s['ville'])) return $s['ville'];
    if (!empty($s['pays'])) return $s['pays'];
    if ($s['latitude'] !== null && $s['longitude'] !== null) {
        return 'Position (' . round((float) $s['latitude'], 4) . ', ' . round((float) $s['longitude'], 4) . ')';
    }
    return 'Localisation inconnue';
}

$resultats = array_map(function ($s) use ($origineBackend) {
    return [
        'id' => (int) $s['id'],
        'zone' => libelleZone($s),
        'adresse_complete' => $s['adresse_formatee'],
        'type_obstacle' => $s['type_obstacle'],
        'gravite_classe' => graviteClasse($s['gravite']),
        'gravite_label' => graviteLabel($s['gravite']),
        'statut' => $s['statut'],
        'valide' => (bool) $s['valide'],
        'confiance' => confiance($s),
        'nb_confirmations' => (int) $s['nb_confirmations'],
        'date_creation' => dateLisible($s['date_creation']),
        'photo' => $s['photo'] ? $origineBackend . '/uploads/' . $s['photo'] : null,
        'lien_maps' => ($s['latitude'] !== null && $s['longitude'] !== null)
            ? "https://www.google.com/maps?q={$s['latitude']},{$s['longitude']}"
            : null,
    ];
}, $rows);

echo json_encode($resultats);