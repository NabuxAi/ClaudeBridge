/*
 * MRC Shell Bank — signatures for the July-2026 nabux webshell campaign
 * (galex / flavor / WSOX File Manager / Star Destroyer / Control Panel + EtherHiding).
 * Tuned for near-zero false positives on legit WordPress. Author: MRC IR.
 */

rule MRC_FileManager_Webshell {
  meta:
    description = "PHP file-manager webshell (WSOX / Star Destroyer / Control Panel family)"
    family = "mrc-filemanager"
  strings:
    $o1 = "$_GET['dir']" ascii
    $o2 = "$_GET['del']" ascii
    $o3 = "$_GET['edit']" ascii
    $o4 = "$_GET['logout']" ascii
    $o5 = "$_POST['cmd']" ascii
    $o6 = "$_POST['action']" ascii
    $o7 = "$_GET['download']" ascii
    $o8 = "$_GET['chmod']" ascii
    $o9 = "$_GET['rename']" ascii
    $o10 = "$_POST['filepath']" ascii
    $o11 = "$_POST['access_code']" ascii
    $o12 = "$_POST['content']" ascii
    $fs1 = "file_put_contents" ascii
    $fs2 = "scandir" ascii
    $fs3 = "opendir" ascii
  condition:
    filesize < 80KB and 4 of ($o*) and any of ($fs*)
}

rule MRC_Direct_Exec_From_Request {
  meta:
    description = "Command/eval executed directly on a superglobal — bare webshell (near-zero FP)"
  strings:
    $x = /(system|exec|shell_exec|passthru|proc_open|popen|eval|assert)\s*\(\s*\$_(GET|POST|REQUEST|COOKIE|SERVER)\s*\[/ ascii
  condition:
    filesize < 300KB and $x
}

rule MRC_Cox_RCE_Shell {
  meta:
    description = "Password-gated command-exec webshell (cox_*.php)"
    family = "mrc-cox"
  strings:
    $s = "[S]" ascii
    $e = "[E]" ascii
    $g = "http_response_code(404)" ascii
    $x1 = "@system(" ascii
    $x2 = "@passthru(" ascii
    $x3 = "@shell_exec(" ascii
    $x4 = "@exec(" ascii
    $er = "error_reporting(0)" ascii
  condition:
    filesize < 20KB and $er and 2 of ($x*) and (( $s and $e ) or $g)
}

rule MRC_Fake_Cache_Plugin {
  meta:
    description = "Fake 'Performance cache handler' plugin header used to disguise the dropper"
  strings:
    $h1 = "Performance cache handler" ascii
    $h2 = "error_reporting(0)" ascii
  condition:
    filesize < 100KB and all of them
}

rule MRC_Split_Obfuscation {
  meta:
    description = "Split-string obfuscation of base64_decode / gzinflate / eval"
  strings:
    $b1 = "'base'.'6'" ascii
    $b2 = "'6'.'4_'" ascii
    $b3 = "'4_'.'decode'" ascii
    $g1 = "'g'.'zi'" ascii
    $g2 = "'zi'.'nfl'" ascii
    $g3 = "'nfl'.'ate'" ascii
    $e1 = "'e'.'v'.'a'.'l'" ascii
    $e2 = "'ev'.'al'" ascii
    $a1 = "'ass'.'ert'" ascii
    $gen = /('[a-z0-9_]{1,4}'\s*\.\s*){4,}'[a-z0-9_]{1,4}'/ ascii
  condition:
    filesize < 800KB and any of them
}

rule MRC_Encoded_Payload_Loader {
  meta:
    description = "gzinflate(base64_decode(...)) packed loader (bless24-style)"
  strings:
    $z1 = "gzinflate(base64_decode(" ascii
    $z2 = "Zlib library to run this application" ascii
    $z3 = /\$[a-zA-Z_0-9]+\s*=\s*base64_decode\(["']Z3ppbmZsYXRl/ ascii
    $z4 = "eval(base64_decode(" ascii
    $z5 = "function __lambda" ascii
  condition:
    filesize < 400KB and any of them
}

rule MRC_EtherHiding {
  meta:
    description = "EtherHiding Polygon on-chain <script> injector (buddypress-style)"
  strings:
    $a = "polygon-bor-rpc.publicnode" ascii
    $b = "new Function(new TextDecoder" ascii
    $c = "0xB6bC9e1D0b2fB96Ab7C47E04Cb0BE477410bC1f2" ascii nocase
    $d = "_f9c0dcf695" ascii
    $self = "cb_op_security_scan" ascii   // our own detector — never flag it
  condition:
    not $self and any of ($a,$b,$c,$d)
}
