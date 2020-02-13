//Author <some@domain.name> released below code into the public domain on Nov 19, 2008
//From: https://stackoverflow.com/questions/183485/converting-punycode-with-dash-character-to-unicode
//https://creativecommons.org/publicdomain/zero/1.0/

function decodeUTF16(input/*string*/) {
  let output = [], i = 0;
  while(i < input.length) {
    let value = input.charCodeAt(i++);
    if((value & 0xF800) === 0xD800) {
      let extra = input.charCodeAt(i++);
      if(((value & 0xFC00) !== 0xD800) || ((extra & 0xFC00) !== 0xDC00)) {
        throw new RangeError("UTF-16(decode): Illegal UTF-16 sequence");
      }
      value = ((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000;
    }
    output.push(value);
  }
  return output;
}

function encodeUTF16(input/*array*/) {
  let output = [], i = 0;
  while(i < input.length) {
    let value = input[i++];
    if((value & 0xF800) === 0xD800) {
      throw new RangeError("UTF-16(encode): Illegal UTF-16 value");
    }
    if(value > 0xFFFF) {
      value -= 0x10000;
      output.push(String.fromCharCode(((value >>> 10) & 0x3FF) | 0xD800));
      value = 0xDC00 | (value & 0x3FF);
    }
    output.push(String.fromCharCode(value));
  }
  return output.join("");
}

var punycode = (function() {
  const INITIAL_N = 0x80;
  const INITIAL_BIAS = 72;
  const DELIMITER = "\x2D";
  const BASE = 36;
  const TMIN = 1;
  const TMAX = 26;
  const MAX_INT = 0x7FFFFFFF;

  // decodeDigit(cp) returns the numeric value of a basic code 
  // point (for use in representing integers) in the range 0 to
  // base-1, or base if cp is does not represent a value.

  function decodeDigit(i) {
      return i - 48 < 10 ? i - 22 : i - 65 < 26 ? i - 65 : i - 97 < 26 ? i - 97 : BASE;
  }

  // encodeDigit(d,flag) returns the basic code point whose value
  // (when used for representing integers) is d, which needs to be in
  // the range 0 to base-1. The lowercase form is used unless flag is
  // nonzero, in which case the uppercase form is used. The behavior
  // is undefined if flag is nonzero and digit d has no uppercase form. 

  function encodeDigit(d, flag) {
      return d + 22 + 75 * (d < 26) - ((flag != 0) << 5);
      //  0..25 map to ASCII a..z or A..Z 
      // 26..35 map to ASCII 0..9
  }

  //** Bias adaptation function **
  function adapt(delta, numPoints, firstTime) {
    const DAMP = 700;
    const SKEW = 38;
    delta = firstTime ? Math.floor(delta/DAMP) : (delta >> 1);
    delta += Math.floor(delta/numPoints);
    let k;
    for(k = 0; delta > (((BASE - TMIN) * TMAX) >> 1); k += BASE) {
      delta = Math.floor(delta/(BASE - TMIN));
    }
    return Math.floor(k + (BASE - TMIN + 1)*delta/(delta + SKEW));
  }

  // encode_basic(bcp,flag) forces a basic code point to lowercase if flag is zero,
  // uppercase if flag is nonzero, and returns the resulting code point.
  // The code point is unchanged if it is caseless.
  // The behavior is undefined if bcp is not a basic code point.

  function encode_basic(bcp, flag) {
      bcp -= (bcp - 97 < 26) << 5;
      return bcp + ((!flag && (bcp - 65 < 26)) << 5);
  }

  return {
    decode: function(input) {
      // Dont use utf16
      let output = [];

      // Handle the basic code points: Let basic be the number of input code 
      // points before the last delimiter, or 0 if there is none, then
      // copy the first basic code points to the output.

      let basic = input.lastIndexOf(DELIMITER);
      if(basic < 0) basic = 0;

      for(let j = 0; j < basic; ++j) {
        let chr = input.charCodeAt(j);
        if(chr >= 0x80) {
          throw new RangeError("Illegal input >= 0x80");
        }
        output.push(chr);
      }

      // Main decoding loop: Start just after the last delimiter if any
      // basic code points were copied; start at the beginning otherwise. 

      let len = input.length;
      let oldi, i = 0;
      let n = INITIAL_N;
      let bias = INITIAL_BIAS;
      for(let ic = basic > 0 ? basic + 1 : 0; ic < len; ) {
        // ic is the index of the next character to be consumed,

        // Decode a generalized variable-length integer into delta,
        // which gets added to i. The overflow checking is easier
        // if we increase i as we go, then subtract off its starting 
        // value at the end to obtain delta.
        oldi = i;
        for(let w = 1, k = BASE; ; k += BASE) {
          if(ic >= len) {
            throw RangeError("punycode_bad_input(1)");
          }
          let digit = decodeDigit(input.charCodeAt(ic++));

          if(digit >= BASE) {
            throw RangeError("punycode_bad_input(2)");
          }
          if(digit > Math.floor((MAX_INT - i)/w)) {
            throw RangeError("punycode_overflow(1)");
          }
          i += digit*w;
          let t = (k <= bias) ? TMIN : (k >= bias + TMAX) ? TMAX : k - bias;
          if(digit < t) break;
          if(w > Math.floor(MAX_INT/(BASE - t))) {
            throw RangeError("punycode_overflow(2)");
          }
          w *= (BASE - t);
        }

        let out = output.length + 1;
        bias = adapt(i - oldi, out, oldi === 0);

        // i was supposed to wrap around from out to 0,
        // incrementing n each time, so we'll fix that now: 
        if(Math.floor(i/out) > MAX_INT - n) {
          throw RangeError("punycode_overflow(3)");
        }
        n += Math.floor(i/out);
        i %= out;

        output.splice(i, 0, n);
        i++;
      }
      return encodeUTF16(output);
    },

    encode: function(input) {
      //** Bias adaptation function **

      // Converts the input in UTF-16 to Unicode
      input = decodeUTF16(input.toLowerCase());

      let output = [];

      // Initialize the state: 
      let n = INITIAL_N;
      let delta = 0;
      let bias = INITIAL_BIAS;
      let len = input.length; // Cache the length

      // Handle the basic code points: 
      for(let j = 0; j < len; ++j) {
        if(input[j] < 0x80) {
          output.push(String.fromCharCode(input[j]));
        }
      }

      let b = output.length;

      // h is the number of code points that have been handled, b is the
      // number of basic code points 
      if(b > 0) output.push(DELIMITER);

      // Main encoding loop: 
      //
      let h = b;
      while(h < len) {
        // All non-basic code points < n have been
        // handled already. Find the next larger one: 
        let m = MAX_INT;
        for(let j = 0; j < len; ++j) {
          let ijv = input[j];
          if(ijv >= n && ijv < m) m = ijv;
        }

        // Increase delta enough to advance the decoder's
        // <n,i> state to <m,0>, but guard against overflow: 

        if(m - n > Math.floor((MAX_INT - delta)/(h + 1))) {
          throw RangeError("punycode_overflow (1)");
        }
        delta += (m - n)*(h + 1);
        n = m;

        for(let j = 0; j < len; ++j) {
          let ijv = input[j];

          if(ijv < n) {
            if(++delta > MAX_INT) return Error("punycode_overflow(2)");
          }

          if(ijv === n) {
            // Represent delta as a generalized variable-length integer: 
            let t, q = delta;
            for(let k = BASE; ; k += BASE) {
              t = (k <= bias) ? TMIN : (k >= bias + TMAX) ? TMAX : k - bias;
              if(q < t) break;
              output.push(String.fromCharCode(encodeDigit(t + (q - t)%(BASE - t), 0)));
              q = Math.floor((q - t)/(BASE - t));
            }
            output.push(String.fromCharCode(encodeDigit(q, 0)));
            bias = adapt(delta, h + 1, h == b);
            delta = 0;
            ++h;
          }
        }

        ++delta, ++n;
      }
      return output.join("");
    },

    toASCII: function(domain) {
      let reg = /[^A-Za-z0-9-]/;
      if(!reg.test(domain)) return domain;
      let arr = domain.split(".");
      let out = [];
      for(let i = 0; i < arr.length; ++i) {
        let s = arr[i];
        out.push(reg.test(s) ? "xn--" + punycode.encode(s) : s);
      }
      return out.join(".");
    },

    toUnicode: function(domain) {
      if(!/\bxn--/.test(domain)) return domain;
      let arr = domain.split(".");
      let out = [];
      for(let i = 0; i < arr.length; ++i) {
        let s = arr[i];
        out.push(/^xn--/.test(s) ? punycode.decode(s.slice(4)) : s);
      }
      return out.join(".");
    }
  };
})();
