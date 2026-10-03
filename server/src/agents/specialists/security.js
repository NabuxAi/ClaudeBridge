// ============================================================
// Security Specialist Sub-Agent
// ============================================================
import * as connector from '../../connector.js'
import { t } from '../../i18n.js'

export const SECURITY_AGENT = {
  id: 'security',
  nameKey: 'agents.specialists.security.name',
  roleKey: 'agents.specialists.security.role',
  systemPrompt: `You are the WordPress security specialist agent.
Your job:
1. Analyse security reports, scans for malicious code (YARA/signatures) and modified WordPress core files.
2. Match plugin and theme versions against vulnerability databases (CVE/NVD/WPScan).
3. Review suspicious access, unknown administrator accounts and dangerous uploaded files (such as PHP files in the uploads folder).
4. Propose remediation that prioritises isolating the threat and keeping the site stable.

Security rules:
- Never make a destructive change without recording a proposal.
- Reports must be clear, backed by real logs, and written fluently in the site owner's language.`,
  
  tools: [
    'security_scan',
    'checksum_verify',
    'core_verify',
    'vulnerability_check',
    'file_integrity_check',
    'admin_users_audit',
  ],

  async analyze(target, options = {}) {
    const findings = {
      threats: [],
      warnings: [],
      checksumIssues: [],
      vulnerabilities: [],
      score: 100,
    }

    try {
      // 1. Run core checksum verification
      const checksumRes = await connector.callTool(target, 'checksum_verify', {}).catch((err) => ({ error: err.message }))
      if (checksumRes && !checksumRes.error) {
        const payload = checksumRes?.content?.[0]?.text ? JSON.parse(checksumRes.content[0].text) : checksumRes
        if (payload?.modified_files?.length) {
          findings.checksumIssues = payload.modified_files
          findings.score -= Math.min(30, payload.modified_files.length * 10)
          findings.threats.push({
            type: 'core_tampering',
            title: t(options.locale, 'agents.security.coreModified', { count: payload.modified_files.length }),
            details: payload.modified_files.slice(0, 5),
          })
        }
      }

      // 2. Run security scanner (YARA heuristics)
      const scanRes = await connector.callTool(target, 'security_scan', { quick: options.quick ?? true }).catch((err) => ({ error: err.message }))
      if (scanRes && !scanRes.error) {
        const payload = scanRes?.content?.[0]?.text ? JSON.parse(scanRes.content[0].text) : scanRes
        if (payload?.threats?.length) {
          findings.threats.push(...payload.threats)
          findings.score -= Math.min(50, payload.threats.length * 20)
        }
      }
    } catch (e) {
      findings.warnings.push(t(options.locale, 'agents.security.failed', { error: e.message }))
    }

    findings.score = Math.max(0, findings.score)
    findings.status = findings.score >= 90 ? 'clean' : findings.score >= 60 ? 'warning' : 'critical'
    return findings
  }
}
