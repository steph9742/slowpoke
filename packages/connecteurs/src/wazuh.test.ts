import { describe, expect, test } from 'bun:test'
import { agregerAuthentifications, dateIndexee, indexValide, lireLemonldap, lireLiaison, lireZimbra, type Evenement } from './wazuh'

const ids = new Set(['jdupont', 'jean.dupont@exemple.fr'])

describe('audit.log de Zimbra', () => {
    test('échec IMAP derrière le proxy : adresse du client, pas celle du proxy', () => {
        const l = '2026-04-28 20:09:06,746 WARN  [ImapSSLServer-16] [ip=10.0.0.5;oip=203.0.113.7;via=10.0.0.5(nginx/1.24.0);ua=Zimbra/10.1.13;cid=1049847;] security - cmd=Auth; account=Jean.Dupont@exemple.fr; protocol=imap; error=authentication failed for [jean.dupont@exemple.fr], invalid password;'
        expect(lireZimbra(l, ids)).toEqual({ source: 'zimbra', compte: 'jean.dupont@exemple.fr', issue: 'echec', ip: '203.0.113.7', protocole: 'imap' })
    })
    test('succès SOAP sans proxy', () => {
        const l = 'INFO  [qtp-196362:http://localhost:8080/service/soap/AuthRequest] [name=jean.dupont@exemple.fr;ip=198.51.100.2;ua=zclient/10;] security - cmd=Auth; account=jean.dupont@exemple.fr; protocol=soap;'
        expect(lireZimbra(l, ids)).toMatchObject({ issue: 'succes', ip: '198.51.100.2', protocole: 'soap' })
    })
    test('changement de mot de passe', () => {
        const l = '[name=jean.dupont@exemple.fr;oip=203.0.113.7;] security - cmd=ChangePassword; account=jean.dupont@exemple.fr;'
        expect(lireZimbra(l, ids)).toMatchObject({ issue: 'mot_de_passe', protocole: 'ChangePassword' })
    })
    test("autre compte ou autre commande : ignoré", () => {
        expect(lireZimbra('security - cmd=Auth; account=autre@exemple.fr; protocol=imap;', ids)).toBeNull()
        expect(lireZimbra('[name=jean.dupont@exemple.fr;] mailbox - cmd=GetMsg; account=jean.dupont@exemple.fr;', ids)).toBeNull()
    })
})

describe('LemonLDAP::NG', () => {
    test('connexion avec adresse', () => {
        expect(lireLemonldap('LLNG[123]: [info] User jdupont connected from LDAP (203.0.113.7)', ids))
            .toEqual({ source: 'lemonldap', compte: 'jdupont', issue: 'succes', ip: '203.0.113.7', protocole: null })
    })
    test('mauvais mot de passe, compte inconnu', () => {
        expect(lireLemonldap('[warn] Bad password for jdupont (203.0.113.7)', ids)).toMatchObject({ issue: 'echec', ip: '203.0.113.7' })
        expect(lireLemonldap('[warn] jdupont was not found in LDAP directory (203.0.113.7)', ids)).toMatchObject({ issue: 'compte_inconnu', ip: '203.0.113.7' })
    })
    test('niveau d\'authentification, sans adresse', () => {
        expect(lireLemonldap('[info] User jdupont successfully authenticated at level 2', ids)).toMatchObject({ issue: 'succes', ip: null })
    })
    test('autre compte : ignoré', () => {
        expect(lireLemonldap('[warn] Bad password for mmartin (203.0.113.7)', ids)).toBeNull()
    })
})

describe('slapd', () => {
    test('liaison par uid ou par DN connu', () => {
        expect(lireLiaison('slapd[99]: conn=1042 op=0 BIND dn="uid=jdupont,ou=people,dc=exemple,dc=fr" method=128', ids, new Set()))
            .toEqual({ conn: '1042', op: '0', compte: 'jdupont' })
        const dn = 'cn=Jean Dupont, ou=people,dc=exemple,dc=fr'
        expect(lireLiaison(`conn=7 op=1 BIND dn="${dn}" method=128`, ids, new Set(['cn=jean dupont,ou=people,dc=exemple,dc=fr'])))
            .toMatchObject({ conn: '7', op: '1' })
    })
    test('recherche ou autre compte : ignoré', () => {
        expect(lireLiaison('conn=1042 op=1 SRCH base="dc=exemple,dc=fr" scope=2 filter="(uid=jdupont)"', ids, new Set())).toBeNull()
        expect(lireLiaison('conn=1 op=0 BIND dn="uid=mmartin,ou=people,dc=exemple,dc=fr" method=128', ids, new Set())).toBeNull()
    })
})

describe('synthèse', () => {
    const ev = (e: Partial<Evenement>): Evenement => ({ source: 'zimbra', compte: 'jdupont', issue: 'succes', ip: null, protocole: null, le: '2026-09-01T10:00:00.000Z', hote: 'sso', ...e })

    test('regroupe et borne dans le temps', () => {
        const lignes = agregerAuthentifications([
            ev({ issue: 'echec', ip: '203.0.113.7', protocole: 'imap', le: '2026-09-01T10:00:00.000Z' }),
            ev({ issue: 'echec', ip: '203.0.113.7', protocole: 'imap', le: '2026-09-01T09:00:00.000Z' }),
            ev({ source: 'ldap', issue: 'succes', ip: '10.0.0.9', protocole: 'bind' }),
        ])
        expect(lignes).toHaveLength(2)
        expect(lignes[0]).toMatchObject({ source: 'zimbra', nombre: 2, premier: '2026-09-01T09:00:00.000Z', dernier: '2026-09-01T10:00:00.000Z' })
        expect(lignes[1]!.source).toBe('ldap')
    })

    test('LemonLDAP : la connexion sans adresse qui double une connexion avec adresse est écartée', () => {
        const lignes = agregerAuthentifications([
            ev({ source: 'lemonldap', ip: '203.0.113.7', le: '2026-09-01T10:00:00.000Z' }),
            ev({ source: 'lemonldap', ip: null, le: '2026-09-01T10:00:01.000Z' }),
            ev({ source: 'lemonldap', ip: null, le: '2026-09-02T10:00:00.000Z' }),
        ])
        expect(lignes.map(l => [l.ip, l.nombre])).toEqual([['203.0.113.7', 1], [null, 1]])
    })
})

test('dates et motifs d\'index', () => {
    expect(dateIndexee('2026-09-14T10:11:12.345+0000')).toBe('2026-09-14T10:11:12.345Z')
    expect(dateIndexee('pas une date')).toBeNull()
    expect(indexValide('wazuh-archives-*')).toBe(true)
    expect(indexValide('wazuh-archives-4.x-*')).toBe(true)
    expect(indexValide('wazuh-archives-*,.opendistro_security')).toBe(false)
    expect(indexValide('_all')).toBe(false)
    expect(indexValide('*')).toBe(false)
})
