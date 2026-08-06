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

const MINUTES_AVANT_INCERTAIN = 90;
const MINUTES_BASE_AVANT_ARCHIVAGE = 180;
const MINUTES_BONUS_PAR_CONFIRMATION = 180;
const SEUIL_CONFIRMATIONS_DEGAGEE = 3;
const SEUIL_CONFIRMATIONS_VALIDATION = 3;

$pdo->exec("
    UPDATE signalements s
    SET s.statut = 'incertain'
    WHERE s.statut = 'actif'
      AND s.valide = 0
      AND TIMESTAMPDIFF(MINUTE, COALESCE(s.derniere_confirmation, s.date_creation), NOW()) >= " . MINUTES_AVANT_INCERTAIN . "
      AND (
          SELECT COUNT(DISTINCT COALESCE(c.visiteur_id, c.ip_utilisateur))
          FROM confirmations c
          WHERE c.signalement_id = s.id AND c.type_confirmation = 'toujours_bloquee'
      ) = 0
");

$pdo->exec("
    UPDATE signalements s
    SET s.statut = 'archive', s.date_archivage = NOW()
    WHERE s.statut IN ('actif', 'incertain')
      AND s.valide = 0
      AND TIMESTAMPDIFF(MINUTE, COALESCE(s.derniere_confirmation, s.date_creation), NOW())
          >= " . MINUTES_BASE_AVANT_ARCHIVAGE . " + " . MINUTES_BONUS_PAR_CONFIRMATION . " * (
              SELECT COUNT(DISTINCT COALESCE(c.visiteur_id, c.ip_utilisateur))
              FROM confirmations c
              WHERE c.signalement_id = s.id AND c.type_confirmation = 'toujours_bloquee'
          )
");
$sql = "
    SELECT s.id, s.type_obstacle, s.gravite, s.date_creation, s.derniere_confirmation, s.statut, s.valide, s.photo,
           s.latitude, s.longitude, s.pays, s.ville, s.quartier, s.adresse_formatee,
           (SELECT COUNT(DISTINCT COALESCE(visiteur_id, ip_utilisateur)) FROM confirmations c WHERE c.signalement_id = s.id AND c.type_confirmation = 'toujours_bloquee') AS nb_confirmations,
           (SELECT COUNT(DISTINCT COALESCE(visiteur_id, ip_utilisateur)) FROM confirmations c WHERE c.signalement_id = s.id AND c.type_confirmation = 'voie_degagee') AS nb_degagees
    FROM signalements s
    WHERE s.statut IN ('actif', 'incertain')
    ORDER BY FIELD(s.gravite, 'Severe', 'Modere', 'Leger', 'Praticable'), s.date_creation DESC
";
$rows = $pdo->query($sql)->fetchAll();

function libelleZone($s) {
    if (!empty($s['quartier'])) return $s['quartier'];
    if (!empty($s['ville'])) return $s['ville'];
    if (!empty($s['pays'])) return $s['pays'];
    if ($s['latitude'] !== null && $s['longitude'] !== null) {
        return 'Position (' . round((float) $s['latitude'], 4) . ', ' . round((float) $s['longitude'], 4) . ')';
    }
    return 'Localisation inconnue';
}

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
function dureeEcoulee($date) {
    $minutes = max(0, floor((time() - strtotime($date)) / 60));
    if ($minutes < 1) return "à l'instant";
    if ($minutes < 60) return $minutes . ' min';
    $heures = floor($minutes / 60);
    $reste = $minutes % 60;
    return $heures . 'h' . str_pad($reste, 2, '0', STR_PAD_LEFT);
}

function confiance($s) {
    if ((bool) $s['valide']) return 'validee';
    if ((int) $s['nb_confirmations'] > 0) return 'confirmee_partiellement';
    if ($s['statut'] === 'incertain') return 'incertain';
    return 'recente';
}

$voies = array_map(function ($s) use ($origineBackend) {
    $estValide = (bool) $s['valide'];
    $nbConfirmations = (int) $s['nb_confirmations'];
    $base = $s['derniere_confirmation'] ?? $s['date_creation'];

    // Fenêtre d'archivage propre à ce signalement 
    $fenetreMinutes = MINUTES_BASE_AVANT_ARCHIVAGE + MINUTES_BONUS_PAR_CONFIRMATION * $nbConfirmations;
    // Une fois validé, il n'y a plus d'archivage auto à annoncer
    $heureArchivage = $estValide ? null : date('H\hi', strtotime($base) + $fenetreMinutes * 60);
    $minutesEcoulees = (time() - strtotime($s['date_creation'])) / 60;
    $estNouveau = $minutesEcoulees < 30;

    return [
        'id' => (int) $s['id'],
        'zone' => libelleZone($s),
        'adresse_complete' => $s['adresse_formatee'],
        'gravite_classe' => graviteClasse($s['gravite']),
        'gravite_label' => graviteLabel($s['gravite']),
        'type_obstacle' => $s['type_obstacle'],
        'latitude' => $s['latitude'] !== null ? (float) $s['latitude'] : null,
        'longitude' => $s['longitude'] !== null ? (float) $s['longitude'] : null,
        'depuis' => dureeEcoulee($s['date_creation']),
        'valide' => $estValide,
        'confiance' => confiance($s),
        'nb_confirmations' => $nbConfirmations,
        'nb_degagees' => (int) $s['nb_degagees'],
        'progression_degagee' => min(100, (int) round((int) $s['nb_degagees'] / SEUIL_CONFIRMATIONS_DEGAGEE * 100)),
        'heure_archivage' => $heureArchivage,
        'photo' => $s['photo'] ? $origineBackend . '/uploads/' . $s['photo'] : null,
        'est_nouveau' => $estNouveau,
        'recemment_degagee' => (int) $s['nb_degagees'] >= SEUIL_CONFIRMATIONS_DEGAGEE,
        'lien_maps' => ($s['latitude'] !== null && $s['longitude'] !== null)
            ? "https://www.google.com/maps?q={$s['latitude']},{$s['longitude']}"
            : null,
    ];
}, $rows);

echo json_encode($voies);
