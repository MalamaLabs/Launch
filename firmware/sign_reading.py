import board
import busio
import time
from adafruit_atecc.adafruit_atecc import ATECC, _WAKE_CLK_FREQ

def sign_reading_with_atecc(payload_hash: bytes) -> str:
    """
    Uses ATECC608A slot 0 to sign a 32-byte SHA-256 hash.
    Returns DER-encoded signature as hex string.
    """
    if len(payload_hash) != 32:
        raise ValueError("Payload hash must be exactly 32 bytes.")
        
    i2c = busio.I2C(board.SCL, board.SDA, frequency=_WAKE_CLK_FREQ)
    
    for attempt in range(1, 4):
        try:
            atecc = ATECC(i2c, address=0x60)
            sig_bytes = bytearray(64)
            atecc.ecdsa_sign(0, payload_hash, sig_bytes)
            
            r = bytes(sig_bytes[:32])
            s = bytes(sig_bytes[32:])
            
            def to_der_int(x):
                x = x.lstrip(b'\x00')
                if not x: return b'\x00'
                if x[0] & 0x80:
                    return b'\x00' + x
                return x

            der_r = to_der_int(r)
            der_s = to_der_int(s)
            
            der_sig = b'\x30' + bytes([len(der_r) + len(der_s) + 4]) + \
                      b'\x02' + bytes([len(der_r)]) + der_r + \
                      b'\x02' + bytes([len(der_s)]) + der_s
                      
            return der_sig.hex()
            
        except Exception as e:
            if attempt == 3:
                raise RuntimeError(f"ATECC608A failed after 3 attempts: {e}")
            time.sleep(1)
            
    return ""
