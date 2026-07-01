use std::io::Read;

use flate2::read::ZlibDecoder;

use crate::types::{LyricLineDto, LyricWordDto};

const QRC_KEY: &[u8; 24] = b"!@#)(*$%123ZXC!@!@#)(NHL";

pub fn decrypt_cloud_qrc(encrypted_qrc: &str) -> anyhow::Result<String> {
    let encrypted = hex::decode(encrypted_qrc.trim())?;
    if encrypted.is_empty() || encrypted.len() % 8 != 0 {
        anyhow::bail!("invalid qrc block length");
    }

    let decrypted = qrc_triple_des(&encrypted, DesMode::Decrypt);

    let mut decoder = ZlibDecoder::new(decrypted.as_slice());
    let mut output = String::new();
    decoder.read_to_string(&mut output)?;
    Ok(output)
}

#[derive(Clone, Copy)]
enum DesMode {
    Encrypt,
    Decrypt,
}

const SBOX: [[u32; 64]; 8] = [
    [
        14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7, 0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8, 4,
        1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0, 15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13,
    ],
    [
        15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10, 3, 13, 4, 7, 15, 2, 8, 15, 12, 0, 1, 10, 6, 9, 11, 5, 0,
        14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15, 13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9,
    ],
    [
        10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8, 13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1, 13,
        6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7, 1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12,
    ],
    [
        7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15, 13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9, 10,
        6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4, 3, 15, 0, 6, 10, 10, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14,
    ],
    [
        2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9, 14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6, 4,
        2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14, 11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3,
    ],
    [
        12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11, 10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8, 9,
        14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6, 4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13,
    ],
    [
        4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1, 13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6, 1,
        4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2, 6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12,
    ],
    [
        13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7, 1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2, 7,
        11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8, 2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11,
    ],
];

const IP_LEFT: [usize; 32] = [
    57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3, 61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23,
    15, 7,
];
const IP_RIGHT: [usize; 32] = [
    56, 48, 40, 32, 24, 16, 8, 0, 58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4, 62, 54, 46, 38, 30, 22,
    14, 6,
];
const P_TABLE: [u32; 32] = [
    15, 6, 19, 20, 28, 11, 27, 16, 0, 14, 22, 25, 4, 17, 30, 9, 1, 7, 23, 13, 31, 26, 2, 8, 18, 12, 29, 5, 21, 10, 3,
    24,
];
const KEY_PERM_C: [usize; 28] = [
    56, 48, 40, 32, 24, 16, 8, 0, 57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35,
];
const KEY_PERM_D: [usize; 28] = [
    62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 60, 52, 44, 36, 28, 20, 12, 4, 27, 19, 11, 3,
];
const KEY_COMPRESSION: [usize; 48] = [
    13, 16, 10, 23, 0, 4, 2, 27, 14, 5, 20, 9, 22, 18, 11, 3, 25, 7, 15, 6, 26, 19, 12, 1, 40, 51, 30, 36, 46, 54, 29,
    39, 50, 44, 32, 47, 43, 48, 38, 55, 33, 52, 45, 41, 49, 35, 28, 31,
];
const KEY_SHIFTS: [u32; 16] = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];

fn qrc_triple_des(data: &[u8], mode: DesMode) -> Vec<u8> {
    let schedules = match mode {
        DesMode::Encrypt => [
            key_schedule(&QRC_KEY[0..8], DesMode::Encrypt),
            key_schedule(&QRC_KEY[8..16], DesMode::Decrypt),
            key_schedule(&QRC_KEY[16..24], DesMode::Encrypt),
        ],
        DesMode::Decrypt => [
            key_schedule(&QRC_KEY[16..24], DesMode::Decrypt),
            key_schedule(&QRC_KEY[8..16], DesMode::Encrypt),
            key_schedule(&QRC_KEY[0..8], DesMode::Decrypt),
        ],
    };

    let mut output = Vec::with_capacity(data.len());
    for chunk in data.chunks_exact(8) {
        let mut block = [0_u8; 8];
        block.copy_from_slice(chunk);
        for schedule in &schedules {
            block = crypt_block(&block, schedule);
        }
        output.extend_from_slice(&block);
    }
    output
}

fn crypt_block(input: &[u8; 8], schedule: &[[u8; 6]; 16]) -> [u8; 8] {
    let (mut s0, mut s1) = initial_permutation(input);
    for round_key in schedule.iter().take(15) {
        let previous_s1 = s1;
        s1 = f(s1, round_key) ^ s0;
        s0 = previous_s1;
    }
    s0 ^= f(s1, &schedule[15]);
    inverse_permutation(s0, s1)
}

fn initial_permutation(input: &[u8; 8]) -> (u32, u32) {
    (permute_input(input, &IP_LEFT), permute_input(input, &IP_RIGHT))
}

fn permute_input(input: &[u8; 8], table: &[usize; 32]) -> u32 {
    table
        .iter()
        .enumerate()
        .fold(0, |acc, (index, bit)| acc | bitnum(input, *bit, 31 - index as u32))
}

fn inverse_permutation(s0: u32, s1: u32) -> [u8; 8] {
    let mut data = [0_u8; 8];
    for (out_index, base) in [(3, 7), (2, 6), (1, 5), (0, 4), (7, 3), (6, 2), (5, 1), (4, 0)] {
        let mut value = 0_u32;
        for group in 0..4 {
            value |= bitnum_intr(s1, base + group * 8, 7 - group * 2);
            value |= bitnum_intr(s0, base + group * 8, 6 - group * 2);
        }
        data[out_index] = value as u8;
    }
    data
}

fn f(state: u32, key: &[u8; 6]) -> u32 {
    let t1 = bitnum_intl(state, 31, 0)
        | ((state & 0xf0000000) >> 1)
        | bitnum_intl(state, 4, 5)
        | bitnum_intl(state, 3, 6)
        | ((state & 0x0f000000) >> 3)
        | bitnum_intl(state, 8, 11)
        | bitnum_intl(state, 7, 12)
        | ((state & 0x00f00000) >> 5)
        | bitnum_intl(state, 12, 17)
        | bitnum_intl(state, 11, 18)
        | ((state & 0x000f0000) >> 7)
        | bitnum_intl(state, 16, 23);
    let t2 = bitnum_intl(state, 15, 0)
        | ((state & 0x0000f000) << 15)
        | bitnum_intl(state, 20, 5)
        | bitnum_intl(state, 19, 6)
        | ((state & 0x00000f00) << 13)
        | bitnum_intl(state, 24, 11)
        | bitnum_intl(state, 23, 12)
        | ((state & 0x000000f0) << 11)
        | bitnum_intl(state, 28, 17)
        | bitnum_intl(state, 27, 18)
        | ((state & 0x0000000f) << 9)
        | bitnum_intl(state, 0, 23);
    let expanded = [
        ((t1 >> 24) as u8) ^ key[0],
        ((t1 >> 16) as u8) ^ key[1],
        ((t1 >> 8) as u8) ^ key[2],
        ((t2 >> 24) as u8) ^ key[3],
        ((t2 >> 16) as u8) ^ key[4],
        ((t2 >> 8) as u8) ^ key[5],
    ];

    let state = (SBOX[0][sbox_bit((expanded[0] >> 2) as u32) as usize] << 28)
        | (SBOX[1][sbox_bit(((expanded[0] & 0x03) << 4 | (expanded[1] >> 4)) as u32) as usize] << 24)
        | (SBOX[2][sbox_bit(((expanded[1] & 0x0f) << 2 | (expanded[2] >> 6)) as u32) as usize] << 20)
        | (SBOX[3][sbox_bit((expanded[2] & 0x3f) as u32) as usize] << 16)
        | (SBOX[4][sbox_bit((expanded[3] >> 2) as u32) as usize] << 12)
        | (SBOX[5][sbox_bit(((expanded[3] & 0x03) << 4 | (expanded[4] >> 4)) as u32) as usize] << 8)
        | (SBOX[6][sbox_bit(((expanded[4] & 0x0f) << 2 | (expanded[5] >> 6)) as u32) as usize] << 4)
        | SBOX[7][sbox_bit((expanded[5] & 0x3f) as u32) as usize];

    P_TABLE
        .iter()
        .enumerate()
        .fold(0, |acc, (index, bit)| acc | bitnum_intl(state, *bit, index as u32))
}

fn key_schedule(key: &[u8], mode: DesMode) -> [[u8; 6]; 16] {
    let mut schedule = [[0_u8; 6]; 16];
    let mut c = KEY_PERM_C
        .iter()
        .enumerate()
        .fold(0, |acc, (index, bit)| acc | bitnum(key, *bit, 31 - index as u32));
    let mut d = KEY_PERM_D
        .iter()
        .enumerate()
        .fold(0, |acc, (index, bit)| acc | bitnum(key, *bit, 31 - index as u32));

    for (round, shift) in KEY_SHIFTS.iter().enumerate() {
        c = ((c << shift) | (c >> (28 - shift))) & 0xfffffff0;
        d = ((d << shift) | (d >> (28 - shift))) & 0xfffffff0;
        let target_round = match mode {
            DesMode::Encrypt => round,
            DesMode::Decrypt => 15 - round,
        };

        for (index, bit) in KEY_COMPRESSION.iter().take(24).enumerate() {
            schedule[target_round][index / 8] |= bitnum_intr(c, *bit as u32, 7 - (index % 8) as u32) as u8;
        }
        for (index, bit) in KEY_COMPRESSION.iter().skip(24).enumerate() {
            schedule[target_round][(index + 24) / 8] |=
                bitnum_intr(d, (*bit - 27) as u32, 7 - (index % 8) as u32) as u8;
        }
    }

    schedule
}

fn bitnum(input: &[u8], bit: usize, shift: u32) -> u32 {
    (((input[(bit / 32) * 4 + 3 - (bit % 32) / 8] >> (7 - bit % 8)) & 1) as u32) << shift
}

fn bitnum_intr(value: u32, bit: u32, shift: u32) -> u32 {
    ((value >> (31 - bit)) & 1) << shift
}

fn bitnum_intl(value: u32, bit: u32, shift: u32) -> u32 {
    ((value << bit) & 0x80000000) >> shift
}

fn sbox_bit(value: u32) -> u32 {
    (value & 32) | ((value & 31) >> 1) | ((value & 1) << 4)
}

pub fn parse_qrc_lines(value: &str) -> Vec<LyricLineDto> {
    let content = extract_lyric_content(value).unwrap_or_else(|| value.to_string());
    content.lines().filter_map(|line| parse_qrc_line(line.trim())).collect()
}

pub fn parse_lrc_lines(value: &str) -> Vec<LyricLineDto> {
    let mut lines = Vec::new();
    for raw_line in value.lines() {
        let mut rest = raw_line;
        let mut starts = Vec::new();
        while let Some((start_ms, next)) = parse_lrc_timestamp(rest) {
            starts.push(start_ms);
            rest = next;
        }
        let text = rest.trim().to_string();
        if text.is_empty() {
            continue;
        }
        for start_ms in starts {
            lines.push(LyricLineDto {
                start_ms,
                end_ms: start_ms,
                text: text.clone(),
                words: Vec::new(),
            });
        }
    }
    lines.sort_by_key(|line| line.start_ms);
    for index in 0..lines.len() {
        let next_start = lines.get(index + 1).map(|line| line.start_ms);
        lines[index].end_ms = next_start.unwrap_or(lines[index].start_ms);
    }
    lines
}

pub fn lines_to_lrc(lines: &[LyricLineDto]) -> String {
    lines
        .iter()
        .filter(|line| !line.text.is_empty())
        .map(|line| format!("[{}]{}", format_lrc_time(line.start_ms), line.text))
        .collect::<Vec<_>>()
        .join("\n")
}

fn extract_lyric_content(value: &str) -> Option<String> {
    let marker = "LyricContent=\"";
    let start = value.find(marker)? + marker.len();
    let end = value[start..].find("\"/>").map(|index| start + index)?;
    Some(unescape_xml_attr(&value[start..end]))
}

fn unescape_xml_attr(value: &str) -> String {
    value
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}

fn parse_qrc_line(line: &str) -> Option<LyricLineDto> {
    let (start_ms, duration_ms, content) = parse_qrc_line_header(line)?;
    let end_ms = start_ms.saturating_add(duration_ms);
    let words = parse_qrc_words(content);
    let text = if words.is_empty() {
        if is_word_timestamp_only(content) {
            String::new()
        } else {
            content.to_string()
        }
    } else {
        words.iter().map(|word| word.text.as_str()).collect()
    };

    Some(LyricLineDto {
        start_ms,
        end_ms,
        text,
        words,
    })
}

fn parse_qrc_line_header(line: &str) -> Option<(u64, u64, &str)> {
    let rest = line.strip_prefix('[')?;
    let close = rest.find(']')?;
    let (start, duration) = rest[..close].split_once(',')?;
    Some((start.parse().ok()?, duration.parse().ok()?, &rest[close + 1..]))
}

fn parse_qrc_words(content: &str) -> Vec<LyricWordDto> {
    let mut words = Vec::new();
    let mut text_start = 0;
    let mut search_start = 0;

    while let Some(open_rel) = content[search_start..].find('(') {
        let open = search_start + open_rel;
        let Some(close_rel) = content[open..].find(')') else {
            break;
        };
        let close = open + close_rel;
        if let Some((start_ms, duration_ms)) = parse_pair(&content[open + 1..close]) {
            let text = &content[text_start..open];
            if !text.is_empty() && text != "\r" {
                words.push(LyricWordDto {
                    start_ms,
                    end_ms: start_ms.saturating_add(duration_ms),
                    text: text.to_string(),
                });
            }
            text_start = close + 1;
            search_start = close + 1;
        } else {
            search_start = open + 1;
        }
    }

    words
}

fn parse_pair(value: &str) -> Option<(u64, u64)> {
    let (start, duration) = value.split_once(',')?;
    Some((start.parse().ok()?, duration.parse().ok()?))
}

fn is_word_timestamp_only(content: &str) -> bool {
    content
        .strip_prefix('(')
        .and_then(|value| value.strip_suffix(')'))
        .and_then(parse_pair)
        .is_some()
}

fn parse_lrc_timestamp(value: &str) -> Option<(u64, &str)> {
    let rest = value.strip_prefix('[')?;
    let close = rest.find(']')?;
    let timestamp = &rest[..close];
    let after = &rest[close + 1..];
    let (minutes, seconds) = timestamp.split_once(':')?;
    let (seconds, fraction) = seconds
        .split_once('.')
        .or_else(|| seconds.split_once(':'))
        .unwrap_or((seconds, "0"));
    let minutes = minutes.parse::<u64>().ok()?;
    let seconds = seconds.parse::<u64>().ok()?;
    let millis = fraction_to_millis(fraction)?;
    Some((minutes * 60_000 + seconds * 1000 + millis, after))
}

fn fraction_to_millis(value: &str) -> Option<u64> {
    let mut millis = String::from(value);
    while millis.len() < 3 {
        millis.push('0');
    }
    millis.get(..3)?.parse().ok()
}

fn format_lrc_time(ms: u64) -> String {
    let minutes = ms / 60_000;
    let seconds = (ms % 60_000) / 1000;
    let centis = (ms % 1000) / 10;
    format!("{minutes:02}:{seconds:02}.{centis:02}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::{Compression, write::ZlibEncoder};
    use std::io::Write;

    #[test]
    fn parses_qrc_words_with_absolute_timing() {
        let input = r#"<Lyric_1 LyricType="1" LyricContent="[1000,900]我(1000,200)遇见(1200,400)你(1600,300)"/>"#;

        let lines = parse_qrc_lines(input);

        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].start_ms, 1000);
        assert_eq!(lines[0].end_ms, 1900);
        assert_eq!(lines[0].text, "我遇见你");
        assert_eq!(lines[0].words[1].text, "遇见");
        assert_eq!(lines[0].words[1].start_ms, 1200);
        assert_eq!(lines[0].words[1].end_ms, 1600);
    }

    #[test]
    fn parses_plain_lrc_fallback() {
        let lines = parse_lrc_lines("[00:01.50]第一句\n[00:03.00]第二句");

        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].start_ms, 1500);
        assert_eq!(lines[0].end_ms, 3000);
        assert_eq!(lines[0].text, "第一句");
    }

    #[test]
    fn decrypts_cloud_qrc_payload() {
        let text = r#"<Lyric_1 LyricType="1" LyricContent="[0,500]测(0,500)"/>"#;
        let encrypted = encrypt_test_payload(text);

        let decrypted = decrypt_cloud_qrc(&encrypted).expect("decrypt qrc fixture");

        assert_eq!(decrypted, text);
    }

    #[test]
    fn decrypts_real_qrc_first_block() {
        let encrypted = hex::decode("8B2C3EBF8F5BE5FE").expect("real qrc hex");

        let decrypted = qrc_triple_des(&encrypted, DesMode::Decrypt);

        assert_eq!(hex::encode(decrypted), "789c459a4b935dc5");
    }

    fn encrypt_test_payload(text: &str) -> String {
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(text.as_bytes()).expect("write compressed qrc");
        let mut compressed = encoder.finish().expect("finish compressed qrc");
        while compressed.len() % 8 != 0 {
            compressed.push(0);
        }

        hex::encode(qrc_triple_des(&compressed, DesMode::Encrypt))
    }
}
