use std::fs::File;
use std::io::{Read, Write};
use zip::write::FileOptions;
use zip::ZipWriter;

fn main() {
    let mut zip = ZipWriter::new(File::create("test.zip").unwrap());
    let options = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file("test/hello.txt", options).unwrap();
    zip.write_all(b"Hello world").unwrap();
    zip.finish().unwrap();
}
