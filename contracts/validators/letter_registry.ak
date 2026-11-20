//// Robin letter registry
////
//// Issuing a service letter = sending a small UTxO to this script's address
//// with an inline datum { letter_hash, issuer }.
////   - UTxO still unspent  -> the letter is active
////   - UTxO has been spent -> the issuer revoked it
////
//// Only the company wallet recorded in the datum can spend (revoke) the UTxO.

use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use cardano/transaction.{OutputReference, Transaction}

pub type LetterDatum {
  /// SHA-256 of the letter PDF (32 bytes)
  letter_hash: ByteArray,
  /// Payment key hash of the issuing company's wallet
  issuer: VerificationKeyHash,
}

pub type LetterRedeemer {
  Revoke
}

validator letter_registry {
  spend(
    datum: Option<LetterDatum>,
    redeemer: LetterRedeemer,
    _own_ref: OutputReference,
    self: Transaction,
  ) {
    expect Some(letter) = datum
    when redeemer is {
      // Only the issuer's key may revoke (spend) the letter UTxO
      Revoke -> list.has(self.extra_signatories, letter.issuer)
    }
  }

  else(_) {
    fail
  }
}

// ---------------------------------------------------------------- tests

const issuer_key: VerificationKeyHash =
  #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

const other_key: VerificationKeyHash =
  #"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

const sample_hash: ByteArray =
  #"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

fn sample_datum() -> LetterDatum {
  LetterDatum { letter_hash: sample_hash, issuer: issuer_key }
}

fn sample_ref() -> OutputReference {
  OutputReference { transaction_id: #"00", output_index: 0 }
}

test issuer_can_revoke() {
  let tx =
    Transaction { ..transaction.placeholder, extra_signatories: [issuer_key] }
  letter_registry.spend(Some(sample_datum()), Revoke, sample_ref(), tx)
}

test stranger_cannot_revoke() fail {
  let tx =
    Transaction { ..transaction.placeholder, extra_signatories: [other_key] }
  letter_registry.spend(Some(sample_datum()), Revoke, sample_ref(), tx)
}

test unsigned_tx_cannot_revoke() fail {
  letter_registry.spend(
    Some(sample_datum()),
    Revoke,
    sample_ref(),
    transaction.placeholder,
  )
}

test missing_datum_cannot_be_spent() fail {
  let tx =
    Transaction { ..transaction.placeholder, extra_signatories: [issuer_key] }
  letter_registry.spend(None, Revoke, sample_ref(), tx)
}
