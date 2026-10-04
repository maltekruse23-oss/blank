//! Local administrator setup; accepts the private pilot key through stdin, never arguments.
use std::io::Read;
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut token = String::new();
    std::io::stdin().take(128).read_to_string(&mut token)?;
    let token = token.trim();
    if token.len() != 64 || !token.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err("Invalid archive key".into());
    }
    let entry = keyring::Entry::new("blank.aram.archive", "import")?;
    match entry.get_password() {
        Ok(existing) if existing == token => (),
        Ok(_) => return Err("Another key is already configured; no overwrite".into()),
        Err(keyring::Error::NoEntry) => entry.set_password(token)?,
        Err(error) => return Err(error.into()),
    }
    println!("Archive credential configured in Windows Credential Manager.");
    Ok(())
}
