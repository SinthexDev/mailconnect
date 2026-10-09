<?php
declare(strict_types=1);

/**
 * Forwards sinthex.de/mailconnect to the local Node process.
 * The application and its secrets stay outside the document root.
 */
set_time_limit(180);
while (ob_get_level() > 0) {
    ob_end_clean();
}

$uri = $_SERVER['REQUEST_URI'] ?? '/mailconnect/';
$url = 'http://127.0.0.1:3911' . $uri;
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$ch = curl_init($url);
if ($ch === false) {
    http_response_code(502);
    header('Content-Type: application/json; charset=utf-8');
    echo '{"error":"proxy","message":"MailConnect ist nicht erreichbar."}';
    exit;
}

$headers = [];
if (function_exists('getallheaders')) {
    foreach (getallheaders() as $name => $value) {
        $lower = strtolower((string) $name);
        if (in_array($lower, ['host', 'content-length', 'connection', 'expect', 'accept-encoding'], true)) {
            continue;
        }
        $headers[] = $name . ': ' . $value;
    }
}
$hasAuth = false;
foreach ($headers as $header) {
    if (stripos($header, 'authorization:') === 0) {
        $hasAuth = true;
        break;
    }
}
$authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
if (!$hasAuth && $authorization !== '') {
    $headers[] = 'Authorization: ' . $authorization;
}
$headers[] = 'X-Forwarded-Proto: https';
$headers[] = 'X-Forwarded-Host: ' . ($_SERVER['HTTP_HOST'] ?? 'sinthex.de');

curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_TIMEOUT => 170,
    CURLOPT_HEADER => false,
    CURLOPT_RETURNTRANSFER => false,
    CURLOPT_HEADERFUNCTION => static function ($curl, string $line): int {
        $trim = trim($line);
        if ($trim === '') {
            return strlen($line);
        }
        if (preg_match('#^HTTP/\S+\s+(\d+)#', $trim, $match) === 1) {
            http_response_code((int) $match[1]);
            return strlen($line);
        }
        $name = strtolower(strtok($trim, ':'));
        if (in_array($name, ['transfer-encoding', 'connection', 'content-length', 'content-encoding', 'keep-alive'], true)) {
            return strlen($line);
        }
        header($trim, false);
        return strlen($line);
    },
    CURLOPT_WRITEFUNCTION => static function ($curl, string $data): int {
        echo $data;
        flush();
        return strlen($data);
    },
]);

if (!in_array($method, ['GET', 'HEAD'], true)) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input') ?: '');
}

$ok = curl_exec($ch);
if ($ok === false && !headers_sent()) {
    http_response_code(502);
    header('Content-Type: application/json; charset=utf-8');
    echo '{"error":"proxy","message":"MailConnect ist nicht erreichbar."}';
}
curl_close($ch);
