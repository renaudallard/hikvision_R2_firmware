#!/usr/bin/env python3
"""
Unbrick a Hikvision device via TFTP.

Based on https://github.com/scottlamb/hikvision-tftpd (MIT license, Scott Lamb).
Ported to Python 3.

The camera's u-boot bootloader sends a SWKH magic handshake on UDP port 9978,
then requests the firmware file via standard TFTP (port 69).
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


class Error(Exception):
    pass


class Server:
    _TFTP_OPCODE_RRQ = 1
    _TFTP_OPCODE_DATA = 3
    _TFTP_OPCODE_ACK = 4
    _TFTP_OPCODE_OACK = 6
    _TFTP_ACK_PREFIX = struct.pack(">h", _TFTP_OPCODE_ACK)

    def __init__(self, handshake_addr, tftp_addr, filename, file_contents):
        self._file_contents = file_contents
        self._filename = filename.encode() if isinstance(filename, str) else filename
        self._tftp_rrq_prefix = (
            struct.pack(">h", self._TFTP_OPCODE_RRQ) + self._filename + b"\x00"
        )
        self._handshake_sock = self._bind(handshake_addr)
        self._tftp_sock = self._bind(tftp_addr)
        self._set_block_size(_DEFAULT_BLOCK_SIZE)

    def _bind(self, addr):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            sock.bind(addr)
        except socket.error as e:
            if e.errno == errno.EADDRNOTAVAIL:
                raise Error(
                    "Address %s:%d not available.\n\n"
                    "Try running:\n"
                    "  sudo ip addr add %s/24 dev eth0\n" % (addr[0], addr[1], addr[0])
                )
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
        self._handshake_sock.close()
        self._tftp_sock.close()

    def run_forever(self):
        while True:
            self._iterate()

    def _iterate(self):
        r, _, _ = select.select([self._handshake_sock, self._tftp_sock], [], [])
        if self._handshake_sock in r:
            self._handshake_read()
        if self._tftp_sock in r:
            self._tftp_read()

    def _handshake_read(self):
        pkt, addr = self._handshake_sock.recvfrom(len(HANDSHAKE_BYTES))
        now = time.strftime(_TIME_FMT)
        if pkt == HANDSHAKE_BYTES:
            self._handshake_sock.sendto(pkt, addr)
            print(
                "%s: Replied to magic handshake request from %s:%d"
                % (now, addr[0], addr[1])
            )
        else:
            print(
                "%s: Unexpected handshake bytes %r from %s:%d"
                % (now, pkt.hex(), addr[0], addr[1])
            )

    def _tftp_read(self):
        pkt, addr = self._tftp_sock.recvfrom(65536)
        now = time.strftime(_TIME_FMT)
        if pkt.startswith(self._tftp_rrq_prefix):
            options = self._parse_options(pkt)
            if "blksize" in options:
                self._set_block_size(int(options["blksize"]))
                print("%s: Sending options ack" % now)
                self._tftp_options_ack(addr)
                return
            self._check_total_block_limit()
            print("%s: Starting transfer" % now)
            self._tftp_maybe_send(0, addr)
        elif pkt.startswith(self._TFTP_ACK_PREFIX):
            (block,) = struct.unpack(">H", pkt[len(self._TFTP_ACK_PREFIX) :])
            self._tftp_maybe_send(block, addr)
        else:
            print(
                "%s: Unexpected TFTP bytes %r from %s:%d"
                % (now, pkt.hex(), addr[0], addr[1])
            )

    def _tftp_options_ack(self, addr):
        self._check_total_block_limit()
        pkt = (
            struct.pack(">H", self._TFTP_OPCODE_OACK)
            + b"blksize\x00"
            + str(self._block_size).encode()
            + b"\x00"
        )
        self._tftp_sock.sendto(pkt, addr)

    def _tftp_maybe_send(self, prev_block, addr):
        block = prev_block + 1
        start_byte = prev_block * self._block_size
        if start_byte > len(self._file_contents):
            print("%s: Done!" % time.strftime(_TIME_FMT))
            if self._block_size != _DEFAULT_BLOCK_SIZE:
                self._set_block_size(_DEFAULT_BLOCK_SIZE)
            return
        block_data = self._file_contents[start_byte : start_byte + self._block_size]
        pkt = struct.pack(">hH", self._TFTP_OPCODE_DATA, block) + block_data
        self._tftp_sock.sendto(pkt, addr)
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
        default="192.0.0.128",
        help="IP address to serve from (default: 192.0.0.128)",
    )
    args = parser.parse_args()

    try:
        with open(args.firmware, "rb") as f:
            file_contents = f.read()
    except IOError as e:
        print("Error: can't read %s" % args.firmware)
        if e.errno == errno.ENOENT:
            print("File not found.")
        sys.exit(1)

    filename = os.path.basename(args.firmware)
    print("Waiting for Hikvision device on %s..." % args.server_ip)

    try:
        server = Server(
            (args.server_ip, _HANDSHAKE_SERVER_PORT),
            (args.server_ip, _TFTP_SERVER_PORT),
            filename,
            file_contents,
        )
    except Error as e:
        print("Error: %s" % e)
        sys.exit(1)

    try:
        server.run_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.close()
