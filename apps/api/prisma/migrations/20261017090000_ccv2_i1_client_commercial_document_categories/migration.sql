-- Checkpoint TENDEROS-2.1-CCV2-I.1 — separation semantique ClientAccount (CRM) / CandidateCompany
-- (candidature).
--
-- La contrainte historique n'autorisait que des categories de CANDIDATURE
-- ('KBIS','TAX_CERTIFICATE','SOCIAL_CERTIFICATE','ARTICLES_OF_ASSOCIATION','OTHER') sur une table
-- pourtant rattachee au CLIENT COMMERCIAL. C'est precisement l'ambiguite que la mission supprime.
--
-- MIGRATION STRICTEMENT ADDITIVE : l'ancien jeu de valeurs reste ACCEPTE afin qu'aucune ligne
-- historique ne devienne invalide (mission §8 : aucune suppression, aucun deplacement destructif).
-- Le nouveau jeu COMMERCIAL est ajoute. C'est la couche APPLICATIVE
-- (`assertClientCommercialDocumentCategory`) qui interdit desormais de CHOISIR une categorie de
-- candidature pour une NOUVELLE association cote client : la base garde l'historique lisible,
-- l'application ferme l'ecriture.
ALTER TABLE "document_client_account_associations"
  DROP CONSTRAINT "document_client_account_associations_category_check";

ALTER TABLE "document_client_account_associations"
  ADD CONSTRAINT "document_client_account_associations_category_check"
  CHECK ("category" IN (
    -- Categories COMMERCIALES (cible I.1).
    'COMMERCIAL_CONTRACT','CLIENT_BRIEF','MEETING_NOTE','CLIENT_PROVIDED_DOCUMENT','INTERNAL_COMMERCIAL_DOCUMENT','OTHER_COMMERCIAL',
    -- Categories HISTORIQUES conservees en lecture, jamais reinscriptibles ici.
    'KBIS','TAX_CERTIFICATE','SOCIAL_CERTIFICATE','ARTICLES_OF_ASSOCIATION','OTHER'
  ));
