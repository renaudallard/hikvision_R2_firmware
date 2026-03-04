#!/usr/bin/env python3
"""
Unbrick a Hikvision device via TFTP.

Based on https://github.com/scottlamb/hikvision-tftpd (MIT license, Scott Lamb).
Ported to Python 3, with support for listening on multiple addresses.

The camera's u-boot bootloader sends a SWKH magic handshake on UDP port 9978,
then requests the firmware file via standard TFTP (port 69).

By default, listens on both known Hikvision recovery addresses:
  192.0.0.128   (older models)
  192.168.1.128 (newer models)
"""

import argparse
import errno
import os
import select
import socket
import struct
import sys
import time

HANDSHAKE_BYTES = struct.pack("20s", b"SWKH")
_HANDSHAKE_SERVER_PORT = 9978
_TFTP_SERVER_PORT = 69
_TIME_FMT = "%c"
_DEFAULT_BLOCK_SIZE = 512
_DEFAULT_IPS = ["192.0.0.128", "192.168.1.128"]


class Error(Exception):
    pass


def _bind(addr):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.bind(addr)
    except socket.error as e:
        if e.errno == errno.EADDRNOTAVAIL:
            return None
        if e.errno == errno.EADDRINUSE:
            raise Error(
                "Address %s:%d in use.\n"
                "Make sure no other TFTP server is running." % addr
            )
        if e.errno == errno.EACCES:
            raise Error(
                "No permission to bind to %s:%d.\nTry running with sudo." % addr
            )
        raise
    return sock


class Server:
    _TFTP_OPCODE_RRQ = 1
    _TFTP_OPCODE_DATA = 3
    _TFTP_OPCODE_ACK = 4
    _TFTP_OPCODE_OACK = 6
    _TFTP_ACK_PREFIX = struct.pack(">h", _TFTP_OPCODE_ACK)

    def __init__(self, ips, filename, file_contents):
        self._file_contents = file_contents
        self._filename = filename.encode() if isinstance(filename, str) else filename
        self._tftp_rrq_prefix = (
            struct.pack(">h", self._TFTP_OPCODE_RRQ) + self._filename + b"\x00"
        )
        self._sockets = []
        self._handshake_socks = set()
        self._tftp_socks = set()
        bound = []
        for ip in ips:
            hs = _bind((ip, _HANDSHAKE_SERVER_PORT))
            tf = _bind((ip, _TFTP_SERVER_PORT))
            if hs and tf:
                self._sockets.extend([hs, tf])
                self._handshake_socks.add(hs)
                self._tftp_socks.add(tf)
                bound.append(ip)
            else:
                if hs:
                    hs.close()
                if tf:
                    tf.close()
        if not bound:
            raise Error(
                "No addresses available.\n\nTry running:\n"
                + "\n".join("  sudo ip addr add %s/24 dev eth0" % ip for ip in ips)
            )
        self._set_block_size(_DEFAULT_BLOCK_SIZE)
        for ip in bound:
            print("Listening on %s" % ip)

    def _set_block_size(self, block_size):
        self._block_size = block_size
        self._total_blocks = (
            len(self._file_contents) + self._block_size
        ) // self._block_size
        print(
            "Serving %d-byte %s (block size %d, %d blocks)"
            % (
                len(self._file_contents),
                self._filename.decode(),
                self._block_size,
                self._total_blocks,
            )
        )

    def _check_total_block_limit(self):
        if self._total_blocks > 65535:
            raise Error(
                "File is too big to serve with %d-byte blocks." % self._block_size
            )

    def _parse_options(self, pkt):
        pkt_options = pkt.split(self._tftp_rrq_prefix)[1]
        options_list = pkt_options.split(b"\x00")[1:]
        options = {}
        for i in range(0, len(options_list) - 1, 2):
            options[options_list[i].decode()] = options_list[i + 1].decode()
        print("Read request options: %s" % options)
        return options

    def close(self):
        for sock in self._sockets:
            sock.close()

    def run_forever(self):
        while True:
            self._iterate()

    def _iterate(self):
        r, _, _ = select.select(self._sockets, [], [])
        for sock in r:
            if sock in self._handshake_socks:
                self._handshake_read(sock)
            elif sock in self._tftp_socks:
                self._tftp_read(sock)

    def _handshake_read(self, sock):
        pkt, addr = sock.recvfrom(len(HANDSHAKE_BYTES))
        now = time.strftime(_TIME_FMT)
        if pkt == HANDSHAKE_BYTES:
            sock.sendto(pkt, addr)
            print(
                "%s: Replied to magic handshake request from %s:%d"
                % (now, addr[0], addr[1])
            )
        else:
            print(
                "%s: Unexpected handshake bytes %r from %s:%d"
                % (now, pkt.hex(), addr[0], addr[1])
            )

    def _tftp_read(self, sock):
        pkt, addr = sock.recvfrom(65536)
        now = time.strftime(_TIME_FMT)
        if pkt.startswith(self._tftp_rrq_prefix):
            options = self._parse_options(pkt)
            if "blksize" in options:
                self._set_block_size(int(options["blksize"]))
                print("%s: Sending options ack" % now)
                self._tftp_options_ack(sock, addr)
                return
            self._check_total_block_limit()
            print("%s: Starting transfer" % now)
            self._tftp_maybe_send(sock, 0, addr)
        elif pkt.startswith(self._TFTP_ACK_PREFIX):
            (block,) = struct.unpack(">H", pkt[len(self._TFTP_ACK_PREFIX) :])
            self._tftp_maybe_send(sock, block, addr)
        else:
            print(
                "%s: Unexpected TFTP bytes %r from %s:%d"
                % (now, pkt.hex(), addr[0], addr[1])
            )

    def _tftp_options_ack(self, sock, addr):
        self._check_total_block_limit()
        pkt = (
            struct.pack(">H", self._TFTP_OPCODE_OACK)
            + b"blksize\x00"
            + str(self._block_size).encode()
            + b"\x00"
        )
        sock.sendto(pkt, addr)

    def _tftp_maybe_send(self, sock, prev_block, addr):
        block = prev_block + 1
        start_byte = prev_block * self._block_size
        if start_byte > len(self._file_contents):
            print("%s: Done!" % time.strftime(_TIME_FMT))
            if self._block_size != _DEFAULT_BLOCK_SIZE:
                self._set_block_size(_DEFAULT_BLOCK_SIZE)
            return
        block_data = self._file_contents[start_byte : start_byte + self._block_size]
        pkt = struct.pack(">hH", self._TFTP_OPCODE_DATA, block) + block_data
        sock.sendto(pkt, addr)
        bar_width = 50
        filled = bar_width * block // self._total_blocks
        print(
            "%s: %5d / %5d [%-*s]"
            % (
                time.strftime(_TIME_FMT),
                block,
                self._total_blocks,
                bar_width,
                "#" * filled,
            )
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "firmware",
        nargs="?",
        default="digicap.dav",
        help="firmware file to serve (default: digicap.dav)",
    )
    parser.add_argument(
        "--server-ip",
        action="append",
        dest="server_ips",
        help="IP address to serve from (can be repeated, default: both 192.0.0.128 and 192.168.1.128)",
    )
    args = parser.parse_args()
    ips = args.server_ips or _DEFAULT_IPS

    try:
        with open(args.firmware, "rb") as f:
            file_contents = f.read()
    except IOError as e:
        print("Error: can't read %s" % args.firmware)
        if e.errno == errno.ENOENT:
            print("File not found.")
        sys.exit(1)

    filename = os.path.basename(args.firmware)
    print("Waiting for Hikvision device...")

    try:
        server = Server(ips, filename, file_contents)
    except Error as e:
        print("Error: %s" % e)
        sys.exit(1)

    try:
        server.run_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.close()
