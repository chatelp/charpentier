import { BlockList, isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';

/**
 * Who may reach /admin (docs/PLAN.md phase 4.6): the home network and
 * Tailscale only. Traefik restricts it too; the server checks again, and to
 * anyone else the page does not exist (404).
 *
 * The client is the last address of X-Forwarded-For, the one our Traefik
 * added (an address before it was given by the client, and is not trusted);
 * behind Cloudflare that is a Cloudflare address, never allowed, so /admin is
 * reached through Traefik directly (the home network) or Tailscale. Without
 * the header (the server's own port on the host, 127.0.0.1:8081), the socket's.
 */
export const DEFAULT_ADMIN_NETWORKS = [
  '127.0.0.0/8',
  '::1/128',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  'fe80::/10',
  // Tailscale: its IPv4 range (CGNAT) and its IPv6 prefix.
  '100.64.0.0/10',
  'fd7a:115c:a1e0::/48',
];

export function networkList(cidrs: readonly string[]): BlockList {
  const list = new BlockList();
  for (const cidr of cidrs) {
    const [address = '', bits = ''] = cidr.trim().split('/');
    const family = isIP(address);
    if (!family || !/^\d+$/.test(bits)) throw new Error(`Not a network: ${cidr}`);
    list.addSubnet(address, Number(bits), family === 6 ? 'ipv6' : 'ipv4');
  }
  return list;
}

/** The address the request came from, as said above. */
export function clientAddress(request: IncomingMessage): string {
  const forwarded = request.headers['x-forwarded-for'];
  const chain = (Array.isArray(forwarded) ? forwarded.join(',') : (forwarded ?? ''))
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
  const address = chain.at(-1) ?? request.socket.remoteAddress ?? '';
  // An IPv4 address seen through an IPv6 socket.
  return address.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '');
}

export function allowed(list: BlockList, request: IncomingMessage): boolean {
  const address = clientAddress(request);
  const family = isIP(address);
  return family !== 0 && list.check(address, family === 6 ? 'ipv6' : 'ipv4');
}
