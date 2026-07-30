use std::fs;

#[derive(Debug, serde::Deserialize)]
struct SkillFrontmatter {
    name: Option<String>,
    description: Option<String>,
}

fn main() {
    let content = fs::read_to_string("/Users/becool/Documents/Github仓库/awesome-design-md/design-md/airbnb/DESIGN.md").unwrap();
    if !content.starts_with("---") {
        println!("No --- at start");
        return;
    }
    let parts: Vec<&str> = content.split("---").collect();
    if parts.len() < 3 {
        println!("parts len < 3");
        return;
    }
    let frontmatter_str = parts[1];
    let frontmatter: Result<SkillFrontmatter, _> = serde_yaml::from_str(frontmatter_str);
    println!("Parsed: {:?}", frontmatter);
}
