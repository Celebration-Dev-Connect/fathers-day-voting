resource "random_password" "db" {
  length           = 32
  special          = true
  override_special = "*-_"  # exclude URL-reserved chars (@#%?/:[]=+&!) to keep the connection string valid
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}
